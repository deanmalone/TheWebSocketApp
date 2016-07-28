$(function () {

    var baseUrl = "wss://" + window.location.host + "/api/messaging";
    var testing = false;
    var msgTimer;
    var webSocket;
    var msgId = 0;

    // Message Settings
    var msgSettings = {
        size: 1024,
        frequency: 500,
        delay: 0
    }

    // Test Status
    var testStatus = {
        webSocketStatus: "",
        msgRxCount: 0,
        msgTxCount: 0,
        charRxCount: 0,
        charTxCount: 0,
        minResponseTime: Number.MAX_SAFE_INTEGER,
        maxResponseTime: Number.MIN_SAFE_INTEGER,
        avgResponseTime: 0
    }

    var msgs = {};

    $("#btnStart").on("click", start);
    $("#btnStop").on("click", stop);

    $("#msgSize").val(msgSettings.size);
    $("#msgFreq").val(msgSettings.frequency);
    $("#msgDelay").val(msgSettings.delay);

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

    function onSendMessage() {

        msgId++;

        // Construct the message
        var msg = {
            id: msgId,
            type: "REQ",
            content: new Array(msgSettings.size + 1).join("A"),
            date: Date.now()
        };

        // store date
        msgs[msgId] = msg.date;

        // send message to server
        var msgString = JSON.stringify(msg)
        webSocket.send(msgString);

        // update Tx stats
        testStatus.msgTxCount++;
        testStatus.charTxCount += msgString.length;
        refreshTestStatusView();
    }

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
});
