using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Threading.Tasks.Dataflow;
using System.Web;
using System.Web.Http;
using System.Web.WebSockets;
using TheWebSocketApp.Models;

namespace TheWebSocketApp.Controllers
{
    public class MessagingController : ApiController
    {
        private const int MAX_MSG_SIZE = 1024 * 64;

        public HttpResponseMessage Get()
        {
            if (HttpContext.Current.IsWebSocketRequest)
            {
                HttpContext.Current.AcceptWebSocketRequest(WebSocketHandler);
                return Request.CreateResponse(HttpStatusCode.SwitchingProtocols);
            }
            else
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest);
            }
        }

        private async Task WebSocketHandler(AspNetWebSocketContext context)
        {
            WebSocket webSocket = context.WebSocket;

            // get the message delay (if set)
            int delay = 0;
            int.TryParse(context.QueryString["delay"], out delay);

            CancellationTokenSource cts = new CancellationTokenSource();

            // define the Dataflow elements
            var incomingQueue = new BufferBlock<AppMessage>();
            var outgoingQueue = new BufferBlock<AppMessage>();

            // use transfrom block to generate and (optionally) delay the message response
            var processingBlock = new TransformBlock<AppMessage, AppMessage>(async item =>
                {
                    item.type = "RSP"; // change type from Request (REQ) to Response (RSP)
                    if (delay > 0)
                    {
                        // Delay sending the response
                        await Task.Delay(delay);
                    }
                    return item;
                },
                new ExecutionDataflowBlockOptions
                {
                    MaxDegreeOfParallelism = DataflowBlockOptions.Unbounded
                });

            // setup the Dataflow pipeline: incomingQueue -> processingBlock -> outgoingQueue
            incomingQueue.LinkTo(processingBlock);
            processingBlock.LinkTo(outgoingQueue);

            try
            {
                // Start routing messages and exit when either task finishes (due to disconnection/error)
                await Task.WhenAny(
                    Receive(webSocket, incomingQueue, cts),
                    Send(webSocket, outgoingQueue, cts));
            }
            finally
            {
                // Clean up
                cts.Cancel();
                incomingQueue.Complete();
                outgoingQueue.Complete();
            }
        }

        private async Task Receive(WebSocket webSocket, BufferBlock<AppMessage> messageQueue, CancellationTokenSource cancel)
        {
            while (webSocket.State == WebSocketState.Open)
            {
                byte[] buffer = new byte[MAX_MSG_SIZE];
                var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancel.Token);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, cancel.Token);
                }
                else if (result.MessageType != WebSocketMessageType.Text)
                {
                    // Only support text messages (not binary)
                    await webSocket.CloseAsync(WebSocketCloseStatus.InvalidMessageType, "Only Text messages supported (not binary)", cancel.Token);
                }
                else
                {
                    int count = result.Count;

                    while (!result.EndOfMessage)
                    {
                        if (count >= MAX_MSG_SIZE)
                        {
                            string closeMessage = string.Format("Exceeded maximum message size: {0} bytes.", MAX_MSG_SIZE);
                            await webSocket.CloseOutputAsync(WebSocketCloseStatus.MessageTooBig, closeMessage, cancel.Token);
                            return;
                        }

                        result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer, count, MAX_MSG_SIZE - count), cancel.Token);
                        count += result.Count;
                    }

                    // extract message and place on queue for further processing
                    var msgString = Encoding.UTF8.GetString(buffer, 0, count);
                    var msg = JsonConvert.DeserializeObject<AppMessage>(msgString);
                    messageQueue.Post(msg);
                }
            }
        }

        private async Task Send(WebSocket webSocket, BufferBlock<AppMessage> messageQueue, CancellationTokenSource cancel)
        {
            while (webSocket.State == WebSocketState.Open)
            {
                var msg = await messageQueue.ReceiveAsync(cancel.Token);
                if (msg != null)
                {
                    var msgBytes = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(msg));
                    await webSocket.SendAsync(new ArraySegment<byte>(msgBytes), WebSocketMessageType.Text, true, cancel.Token);
                }
            }
        }

    }
}
