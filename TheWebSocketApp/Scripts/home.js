/**
 * Provides functions to test WebSocket response times by sending (json) messages of specified size 
 * and frequency to the WebSocket server.
 */
$(function () {

    var baseUrl = "wss://" + window.location.host + "/api/messaging";
    var testing = false;    // indicates whether testing is in progress 
    var msgTimer;           // timer for sending messages based specified frequency
    var webSocket;          // WebSocket client object
    var msgId = 0;          // sequential message id

    // Message Settings
    var msgSettings = {
        size: 1024,         // size of message content (in characters)
        frequency: 500,     // frequency of which message will be sent (milliseconds)
        delay: 0            // server-side delay (milliseconds)
    }

    // Test Status
    var testStatus = {
        webSocketStatus: "",// status of websocket connection
        msgRxCount: 0,      // number of messages received
        msgTxCount: 0,      // number of messages sent
        charRxCount: 0,     // number of characters received
        charTxCount: 0,     // number of characters sent
        minResponseTime: Number.MAX_SAFE_INTEGER,   // minimum response time (ms)
        maxResponseTime: Number.MIN_SAFE_INTEGER,   // maximum response time (ms)
        avgResponseTime: 0  // moving average of response time (ms)
    }

    var msgs = {};          // temporary store for sent messages, used to calculate response times
    var dataPoints = [];    // data points for chart. Each data point represented by: x = msgId, y = responseTime
    var dataLength = 200;   // number of data points visible at any point

    // Setup chart to display response times
    var chart = new CanvasJS.Chart("chartContainer", {
        title: {
            text: "WebSocket response times"
        },
        axisX: {
            title: "Message #"
        },
        axisY: {
            title: "Response time (ms)"
        },
        data: [{
            type: "line",
            dataPoints: dataPoints
        }]
    });

    // Initialise UI & event handlers
    $("#btnStart").on("click", start);
    $("#btnStop").on("click", stop);

    $("#msgSize").val(msgSettings.size);
    $("#msgFreq").val(msgSettings.frequency);
    $("#msgDelay").val(msgSettings.delay);


   /**
    * Start sending messages to server based on message settings
    */
    function start() {
        if (!testing) {
            testing = true;

            msgSettings.size = parseInt($("#msgSize").val());
            msgSettings.frequency = $("#msgFreq").val();
            msgSettings.delay = $("#msgDelay").val();

            testStatus.msgRxCount = 0;
            testStatus.msgTxCount = 0;
            testStatus.charRxCount = 0;
            testStatus.charTxCount = 0;
            testStatus.minResponseTime = Number.MAX_SAFE_INTEGER;
            testStatus.maxResponseTime = Number.MIN_SAFE_INTEGER;
            testStatus.avgResponseTime = 0;
            refreshTestStatusView();

            msgId = 0;
            dataPoints.length = 0;
            msgs = {};

            // establish websocket connection
            var url = baseUrl + "?delay=" + msgSettings.delay;
            console.log(url);

            webSocket = new WebSocket(url);
            webSocket.onopen = function () {
                // start sending messages as the websocket connection is open
                msgTimer = setInterval(function () { onSendMessage() }, msgSettings.frequency);
                testStatus.webSocketStatus = "OPEN";
                refreshTestStatusView();
            }

            webSocket.onmessage = function (event) {
                var msg = JSON.parse(event.data);
                var responseTime = Date.now() - msgs[msg.id];
                delete msgs[msg.id];

                // update Rx stats, including avg, max, min response times
                testStatus.msgRxCount++;
                testStatus.charRxCount += event.data.toString().length;
                testStatus.avgResponseTime = ((testStatus.avgResponseTime * testStatus.msgRxCount) + responseTime) / (testStatus.msgRxCount + 1);
                if (responseTime > testStatus.maxResponseTime) testStatus.maxResponseTime = responseTime;
                if (responseTime < testStatus.minResponseTime) testStatus.minResponseTime = responseTime;

                refreshTestStatusView();
                updateChart(msg.id, responseTime);
            }

            webSocket.onerror = function () {
                stop();
                testStatus.webSocketStatus = "ERROR";
                refreshTestStatusView();
            }

            webSocket.onclose = function (event) {
                stop();
                testStatus.webSocketStatus = "CLOSED";
                refreshTestStatusView();
            }
        }
    }


   /**
    * Stop testing
    */
    function stop() {
        if (testing) {
            // stop the message timer, close socket
            testing = false;
            clearInterval(msgTimer);
            try {
                webSocket.close();
            }
            finally {}
        }
    }


   /**
    * Send (json) message to server over the WebSocket
    */
    function onSendMessage() {

        msgId++;

        // Construct the message
        var msg = {
            id: msgId,
            type: "REQ",
            content: new Array(msgSettings.size + 1).join("A"),
            date: Date.now()
        };

        // store date so can calculate response time
        msgs[msgId] = msg.date;

        // send message to server
        var msgString = JSON.stringify(msg)
        webSocket.send(msgString);

        // update Tx stats
        testStatus.msgTxCount++;
        testStatus.charTxCount += msgString.length;
        refreshTestStatusView();
    }


   /**
    * Refresh the view with updated test status metrics
    */
    function refreshTestStatusView() {
        $("#status").text(testStatus.webSocketStatus);
        $("#msgRx").text(testStatus.msgRxCount);
        $("#msgTx").text(testStatus.msgTxCount);
        $("#charRx").text(testStatus.charRxCount);
        $("#charTx").text(testStatus.charTxCount);
        $("#avg").text(testStatus.avgResponseTime.toFixed(1));
        if (testStatus.minResponseTime != Number.MAX_SAFE_INTEGER) $("#min").text(testStatus.minResponseTime); 
        if (testStatus.maxResponseTime != Number.MIN_SAFE_INTEGER) $("#max").text(testStatus.maxResponseTime);
    }


   /**
    * Update chart data with new data point and render chart
    * @param {number} msgId - The message Id
    * @param {number} responseTime - The message response time
    */
    function updateChart(msgId, responseTime) {
        // Update data array
        dataPoints.push({ x: msgId, y: responseTime });

        // Remove earlier data
        if (dataPoints.length > dataLength) {
            dataPoints.shift();
        }

        // Refresh chart with updated data
        chart.render();
    }
});
