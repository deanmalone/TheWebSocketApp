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
using System.Web;
using System.Web.Http;
using System.Web.WebSockets;

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

            while (webSocket.State == WebSocketState.Open)
            {
                byte[] buffer = new byte[MAX_MSG_SIZE];
                var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, CancellationToken.None);
                }
                else if (result.MessageType != WebSocketMessageType.Text)
                {
                    // Only support text messages (not binary)
                    await webSocket.CloseAsync(WebSocketCloseStatus.InvalidMessageType, "Only Text messages supported (not binary)", CancellationToken.None);
                }
                else
                {
                    int count = result.Count;

                    while (!result.EndOfMessage)
                    {
                        if (count >= MAX_MSG_SIZE)
                        {
                            string closeMessage = string.Format("Exceeded maximum message size: {0} bytes.", MAX_MSG_SIZE);
                            await webSocket.CloseOutputAsync(WebSocketCloseStatus.MessageTooBig, closeMessage, CancellationToken.None);
                            return;
                        }

                        result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer, count, MAX_MSG_SIZE - count), CancellationToken.None);
                        count += result.Count;
                    }

                    // extract message
                    var msgString = Encoding.UTF8.GetString(buffer, 0, count);
                    var msg = (dynamic) JsonConvert.DeserializeObject(msgString);
                    msg.type = "RSP"; // change type from Request (REQ) to Response (RSP)

                    // send response back to client
                    var msgBytes = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(msg));
                    await webSocket.SendAsync(new ArraySegment<byte>(msgBytes), WebSocketMessageType.Text, true, CancellationToken.None);

                }
            }

        }

    }
}
