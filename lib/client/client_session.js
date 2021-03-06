/**
 * @module opcua.client
 */
require("requirish")._(module);

var util = require("util");
var _ = require("underscore");
var assert = require("better-assert");

var resolveNodeId = require("lib/datamodel/nodeid").resolveNodeId;

var DataValue = require("lib/datamodel/datavalue").DataValue;

var OPCUAClientBase = require("lib/client/client_base").OPCUAClientBase;

var NodeId = require("lib/datamodel/nodeid").NodeId;

var makeNodeId = require("lib/datamodel/nodeid").makeNodeId;
var coerceNodeId = require("lib/datamodel/nodeid").coerceNodeId;
var StatusCodes = require("lib/datamodel/opcua_status_code").StatusCodes;

var session_service = require("lib/services/session_service");
var AnonymousIdentityToken = session_service.AnonymousIdentityToken;
var CreateSessionRequest = session_service.CreateSessionRequest;
var CreateSessionResponse = session_service.CreateSessionResponse;
var ActivateSessionRequest = session_service.ActivateSessionRequest;
var ActivateSessionResponse = session_service.ActivateSessionResponse;
var CloseSessionRequest = session_service.CloseSessionRequest;

var endpoints_service = require("lib/services/get_endpoints_service");
var ApplicationDescription = endpoints_service.ApplicationDescription;
var ApplicationType = endpoints_service.ApplicationType;

var subscription_service = require("lib/services/subscription_service");

var read_service = require("lib/services/read_service");

var browse_service = require("lib/services/browse_service");

var write_service = require("lib/services/write_service");

var call_service = require("lib/services/call_service");
var DataType = require("lib/datamodel/variant").DataType;

/**
 * @class ClientSession
 * @param client {OPCUAClient}
 * @constructor
 */
var ClientSession = function (client) {
    this._client = client;
    this._publishEngine = null;
};

ClientSession.prototype.getPublishEngine = function () {

    if (!this._publishEngine) {

        var ClientSidePublishEngine = require("lib/client/client_publish_engine").ClientSidePublishEngine;
        this._publishEngine = new ClientSidePublishEngine(this, {keep_alive_interval: 100});
    }

    return this._publishEngine;
};


function coerceBrowseDescription(data) {
    if (typeof data === 'string' || data instanceof NodeId) {
        return coerceBrowseDescription({
            nodeId: data,
            includeSubtypes: true,
            browseDirection: browse_service.BrowseDirection.Both,
            nodeClassMask: 0,
            resultMask: 63
        });
    } else {
        data.nodeId = resolveNodeId(data.nodeId);
        data.referenceTypeId = data.referenceTypeId ? resolveNodeId(data.referenceTypeId) : null;
        return new browse_service.BrowseDescription(data);
    }
}

/**
 * browse a node or an array of nodes.
 *
 * @method browse
 * @async
 *
 * @example:
 *
 * form1:
 *
 *    ``` javascript
 *    session.browse("RootFolder",function(err,results,diagnostics) {} );
 *    ```
 *
 * form2:
 *
 *    ``` javascript
 *    var browseDescription = {
 *       nodeId: "ObjectsFolder",
 *       referenceTypeId: "Organizes",
 *       browseDirection: BrowseDirection.Inverse
 *    }
 *    session.browse(browseDescription,function(err,results,diagnostics) {} );
 *    ```
 *
 * form3:
 *
 *    ``` javascript
 *    session.browse([ "RootFolder", "ObjectsFolder"],function(err,results,diagnostics) {
 *       assert(results.length === 2);
 *    });
 *    ```
 *
 * form4:
 *
 *   ``` javascript
 *    var browseDescription = {
 *       nodeId: "ObjectsFolder",
 *       referenceTypeId: "Organizes",
 *       browseDirection: BrowseDirection.Inverse
 *    }
 *    session.browse(browseDescription,function(err,results,diagnostics) {} );
 *    ```
 *
 * @param nodes {Object}
 * @param {Function} callback
 * @param {Error|null} callback.err
 * @param {BrowseResult[]} callback.results an array containing the BrowseResult of each BrowseDescription.
 */
ClientSession.prototype.browse = function (nodes, callback) {

    var self = this;
    self.requestedMaxReferencesPerNode = self.requestedMaxReferencesPerNode || 10000;
    assert(_.isFinite(self.requestedMaxReferencesPerNode));
    assert(_.isFunction(callback));

    if (!_.isArray(nodes)) {
        nodes = [nodes];
    }

    var nodesToBrowse = nodes.map(coerceBrowseDescription);

    var request = new browse_service.BrowseRequest({
        nodesToBrowse: nodesToBrowse,
        requestedMaxReferencesPerNode: self.requestedMaxReferencesPerNode
    });

    self.performMessageTransaction(request, function (err, response) {
        if (err) {
            callback(err, null, response);
        } else {

            assert(response instanceof browse_service.BrowseResponse);

            assert(nodesToBrowse.length === response.results.length);

            if(self.requestedMaxReferencesPerNode>0) {

                for (var i =0;i< response.results.length;i++) {
                    var r = response.results[i];
                    if (r.references.length > self.requestedMaxReferencesPerNode) {
                        console.log("warning".yellow+" BrowseResponse : server didn't take into account our requestedMaxReferencesPerNode ");
                        console.log("        self.requestedMaxReferencesPerNode= " + self.requestedMaxReferencesPerNode);
                        console.log("        got " + r.references.length + "for " + nodesToBrowse[i].nodeId.toString());
                        console.log("        continuationPoint ",r.continuationPoint);
                    }
                }
            }
            // detect unsupported case :
            // todo implement proper support for r.continuationPoint
            for (var i =0;i< response.results.length;i++) {
                var r = response.results[i];
                if (r.continuationPoint!==null) {
                    console.log(" warning:".yellow," BrowseResponse : server did'nt send all references and has provided a continuationPoint. Unfortunately we do not support this yet");
                    console.log("           self.requestedMaxReferencesPerNode = ",self.requestedMaxReferencesPerNode);
                    console.log("           continuationPoint ",r.continuationPoint);
                }
            }
            callback(null, response.results, response.diagnosticInfos);
        }
    });

};


/**
 * @method readVariableValue
 * @async
 * @example:
 *
 *     session.readVariableValue("ns=2;s=Furnace_1.Temperature",function(err,dataValues,diagnostics) {} );
 *
 * @param nodes  {ReadValueId[]} - the read value id
 * @param {Function} callback -   the callback function
 * @param callback.err {object|null} the error if write has failed or null if OK
 * @param callback.results {DataValue[]} - an array of dataValue each read
 * @param callback.diagnosticInfos {DiagnosticInfo[]} - the diagnostic infos.
 */
ClientSession.prototype.readVariableValue = function (nodes, callback) {

    assert(_.isFunction(callback));
    if (!_.isArray(nodes)) {
        nodes = [nodes];
    }


    var nodesToRead = [];

    nodes.forEach(function (node) {
        nodesToRead.push({
            nodeId: resolveNodeId(node),
            attributeId: read_service.AttributeIds.Value,
            indexRange: null,
            dataEncoding: {namespaceIndex: 0, name: null}
        });
    });

    var request = new read_service.ReadRequest({
        nodesToRead: nodesToRead,
        timestampsToReturn: read_service.TimestampsToReturn.Neither
    });

    assert(nodes.length === request.nodesToRead.length);

    this.performMessageTransaction(request, function (err, response) {

        if (err) {
            callback(err, response);
        } else {
            assert(response instanceof read_service.ReadResponse);
            assert(nodes.length === response.results.length);
            callback(null, response.results, response.diagnosticInfos);
        }
    });

};


/**
 * @async
 * @method write
 * @param nodesToWrite {Array.<WriteValue>}  - the array of value to write. One or more elements.
 *
 * @param {Function} callback -   the callback function
 * @param callback.err {object|null} the error if write has failed or null if OK
 * @param callback.statusCodes {StatusCode[]} - an array of status code of each write
 * @param callback.diagnosticInfos {DiagnosticInfo[]} - the diagnostic infos.
 */
ClientSession.prototype.write = function (nodesToWrite, callback) {

    assert(_.isFunction(callback));
    assert(_.isArray(nodesToWrite));
    assert(nodesToWrite.length > 0);

    var request = new write_service.WriteRequest({nodesToWrite: nodesToWrite});

    assert(request.nodesToWrite[0] instanceof write_service.WriteValue);

    this.performMessageTransaction(request, function (err, response) {

        if (err) {
            callback(err, response);
        } else {
            assert(response instanceof write_service.WriteResponse);
            assert(nodesToWrite.length === response.results.length);
            callback(null, response.results, response.diagnosticInfos);
        }
    });
};


/**
 *
 * @async
 * @method writeSingleNode
 * @param nodeId  {NodeId}  - the node id of the node to write
 * @param value   {Variant} - the value to write
 * @param callback   {Function}
 * @param callback.err {object|null} the error if write has failed or null if OK
 * @param callback.statusCode {StatusCode} - the status code of the write
 * @param callback.diagnosticInfo {DiagnosticInfo} the diagnostic info.
 */
ClientSession.prototype.writeSingleNode = function (nodeId, value, callback) {

    assert(_.isFunction(callback));

    var nodesToWrite = [];

    nodesToWrite.push({
        nodeId: resolveNodeId(nodeId),
        attributeId: read_service.AttributeIds.Value,
        indexRange: null,
        value: new DataValue({value: value})
    });
    this.write(nodesToWrite, function (err, statusCodes, diagnosticInfos) {
        if (err) {
            callback(err, null, null);
        } else {
            assert(statusCodes.length === 1);
            var diagnosticInfo = diagnosticInfos ? diagnosticInfos[0] : null;
            callback(null, statusCodes[0], diagnosticInfo);
        }
    });
};


/**
 * @method readAllAttributes
 *
 * @example:
 *
 *    ``` javascript
 *    session.readAllAttributes("ns=2;s=Furnace_1.Temperature",function(err,dataValues,diagnostics) {} );
 *    ```
 *
 * @async
 * @param nodes  {NodeId[]} - an array of nodeId to read
 * @param callback              {Function} - the callback function
 * @param callback.err          {Error|null} - the error or null if the transaction was OK
 * @param callback.nodesToRead  {ReadValueId[]}
 * @param callback.results      {DataValue[]}
 * @param callback.diagnosticInfos {DiagnosticInfo[]}
 *
 */
ClientSession.prototype.readAllAttributes = function (nodes, callback) {

    assert(_.isFunction(callback));
    if (!_.isArray(nodes)) {
        nodes = [nodes];
    }


    var nodesToRead = [];

    nodes.forEach(function (node) {
        Object.keys(read_service.AttributeIds).forEach(function (key) {
            var attributeId = read_service.AttributeIds[key];
            nodesToRead.push({
                nodeId: resolveNodeId(node),
                attributeId: attributeId,
                indexRange: null,
                dataEncoding: {namespaceIndex: 0, name: null}
            });
        });
    });

    this.read(nodesToRead, function (err, nodesToRead, result, diagnosticInfos) {
        callback(err, nodesToRead, result, diagnosticInfos);
    });


};

/**
 * @method read
 *
 * @example:
 *
 *    ``` javascript
 *    var nodesToRead = [
 *        {
 *             nodeId:      "ns=2;s=Furnace_1.Temperature",
 *             attributeId: AttributeIds.BrowseName
 *        }
 *    ];
 *    session.read(nodesToRead,function(err,nodesToRead,results,diagnosticInfos) {
 *        if (!err) {
 *        }
 *    });
 *    ```
 *
 * @async
 * @param nodesToRead               {[]} - an array of nodeId to read
 * @param nodesToRead[].nodeId       {NodeId|string}
 * @param nodesToRead[].attributeId  {AttributeId[]}
 * @param [maxAge]                 {Number}
 * @param callback                 {Function}      - the callback function
 * @param callback.err             {Error|null}    - the error or null if the transaction was OK
 * @param callback.nodesToRead     {ReadValueId[]}
 * @param callback.results         {DataValue[]}
 * @param callback.diagnosticInfos {DiagnosticInfo[]}
 *
 */
ClientSession.prototype.read = function (nodesToRead, maxAge, callback) {

    if (!callback) {
        callback = maxAge;
        maxAge = 0;
    }

    assert(_.isArray(nodesToRead));
    assert(_.isFunction(callback));

    // coerce nodeIds
    nodesToRead.forEach(function (node) {
        node.nodeId = resolveNodeId(node.nodeId);
    });

    var request = new read_service.ReadRequest({
        nodesToRead: nodesToRead,
        maxAge: maxAge,
        timestampsToReturn: read_service.TimestampsToReturn.Both
    });

    this.performMessageTransaction(request, function (err, response) {

        if (err) {
            callback(err, response);
        } else {
            assert(response instanceof read_service.ReadResponse);
            callback(null, nodesToRead, response.results, response.diagnosticInfos);
        }

    });
};

ClientSession.prototype._defaultRequest = function (SomeRequest, SomeResponse, options, callback) {

    assert(_.isFunction(callback));

    var request = new SomeRequest(options);
    request.trace = new Error().stack;

    this.performMessageTransaction(request, function (err, response) {

        if (err) {
            callback(err, response);
        } else {
            assert(response instanceof SomeResponse);
            callback(null, response);
        }
    });
};

/**
 * @method createSubscription
 * @async
 *
 * @example:
 *
 *    ``` javascript
 *    session.createSubscription(request,function(err,response) {} );
 *    ```
 *
 * @param options  {CreateSubscriptionRequest}
 * @param options.requestedPublishingInterval {Duration}
 * @param options.requestedLifetimeCount {Counter}
 * @param options.requestedMaxKeepAliveCount {Counter}
 * @param options.maxNotificationsPerPublish {Counter}
 * @param options.publishingEnabled {Boolean}
 * @param options.priority {Byte}
 * @param callback {Function}
 * @param callback.err {Error|null}   - the Error if the async method has failed
 * @param callback.response {CreateSubscriptionResponse} - the response
 */
ClientSession.prototype.createSubscription = function (options, callback) {

    assert(_.isFunction(callback));

    var request = new subscription_service.CreateSubscriptionRequest(options);

    this.performMessageTransaction(request, function (err, response) {

        if (err) {
            callback(err, response);
        } else {
            assert(response instanceof subscription_service.CreateSubscriptionResponse);
            callback(null, response);
        }
    });

};
/**
 * @method deleteSubscriptions
 * @async
 * @example:
 *
 *     session.deleteSubscriptions(request,function(err,response) {} );
 *
 * @param options {DeleteSubscriptionsRequest}
 * @param callback {Function}
 * @param callback.err {Error|null}   - the Error if the async method has failed
 * @param callback.response {DeleteSubscriptionsResponse} - the response
 */
ClientSession.prototype.deleteSubscriptions = function (options, callback) {
    this._defaultRequest(
        subscription_service.DeleteSubscriptionsRequest,
        subscription_service.DeleteSubscriptionsResponse,
        options, callback);
};
/**
 *
 * @method createMonitoredItems
 * @async
 * @param options  {CreateMonitoredItemsRequest}
 * @param callback {Function}
 * @param callback.err {Error|null}   - the Error if the async method has failed
 * @param callback.response {CreateMonitoredItemsResponse} - the response
 */
ClientSession.prototype.createMonitoredItems = function (options, callback) {
    this._defaultRequest(
        subscription_service.CreateMonitoredItemsRequest,
        subscription_service.CreateMonitoredItemsResponse,
        options, callback);
};

/**
 *
 * @method publish
 * @async
 * @param options  {PublishRequest}
 * @param callback {Function}
 * @param callback.err {Error|null}   - the Error if the async method has failed
 * @param callback.response {PublishResponse} - the response
 */
ClientSession.prototype.publish = function (options, callback) {
    this._defaultRequest(
        subscription_service.PublishRequest,
        subscription_service.PublishResponse,
        options, callback);
};


/**
 *
 * @method republish
 * @async
 * @param options  {RepublishRequest}
 * @param callback {Function}
 * @param callback.err {Error|null}   - the Error if the async method has failed
 * @param callback.response {RepublishResponse} - the response
 */
ClientSession.prototype.republish = function (options, callback) {
    this._defaultRequest(
        subscription_service.RepublishRequest,
        subscription_service.RepublishResponse,
        options, callback);
};


/**
 *
 * @method deleteMonitoredItems
 * @async
 * @param options  {DeleteMonitoredItemsRequest}
 * @param callback {Function}
 * @param callback.err {Error|null}   - the Error if the async method has failed
 */
ClientSession.prototype.deleteMonitoredItems = function (options, callback) {
    this._defaultRequest(
        subscription_service.DeleteMonitoredItemsRequest,
        subscription_service.DeleteMonitoredItemsResponse,
        options, callback);
};

/**
 *
 * @method setPublishingMode
 * @async
 * @param options  {SetPublishingModeRequest}
 * @param callback {Function}
 * @param callback.err {Error|null}   - the Error if the async method has failed
 */
ClientSession.prototype.setPublishingMode = function (options, callback) {
    this._defaultRequest(
        subscription_service.SetPublishingModeRequest,
        subscription_service.SetPublishingModeResponse,
        options, callback);
};

/**
 *
 * @method translateBrowsePath
 * @async
 * @param browsePath
 * @param callback {Function}
 */
ClientSession.prototype.translateBrowsePath = function (browsePath, callback) {
    assert(_.isFunction(callback));

    var constructBrowsePath = require("lib/address_space/address_space").constructBrowsePath;
    if (typeof browsePath === "string") {
        browsePath = constructBrowsePath("/", browsePath);
    }
    var translate_service = require("lib/services/translate_browse_paths_to_node_ids_service");

    var request = new translate_service.TranslateBrowsePathsToNodeIdsRequest({
        browsePath: [browsePath]
    });

    this.performMessageTransaction(request, function (err, response) {
        if (err) {
            callback(err, response);
        } else {
            assert(response instanceof translate_service.TranslateBrowsePathsToNodeIdsResponse);
            callback(null, response.results[0]);
        }
    });

};

ClientSession.prototype.performMessageTransaction = function (request, callback) {

    assert(_.isFunction(callback));
    assert(this._client);
    if (!this._client._secureChannel) {
        console.log(" performMessageTransaction : no valid channel".red.bold);
        console.log("  cannot send ",request.toString());
        return callback(new Error("invalid Channel : cannot send "));
    }
    assert(this._client._secureChannel);

    request.requestHeader.authenticationToken = this.authenticationToken;
    this._client._secureChannel.performMessageTransaction(request, function (err, response) {

        if (!err) {
            if (response.responseHeader.serviceResult !== StatusCodes.Good) {
                //xx console.log("xxx ",request.trace);
                err = new Error(" ServiceResult is " + response.responseHeader.serviceResult.toString());
                //xx console.log("xxx ",err.message);
            }
        }
        callback(err, response);
    });
};

/**
 *
 * @method close
 * @async
 * @param callback {Function}
 */
ClientSession.prototype.close = function (callback) {
    assert(_.isFunction(callback));
    assert(this._client);
    this._client.closeSession(this, callback);
    if (this._publishEngine) {
        this._publishEngine.terminate();
        this._publishEngine = null;
    }

};

ClientSession.prototype.call = function (methodsToCall, callback) {
    var self = this;


    assert(_.isArray(methodsToCall));

    // Note : The client has no explicit address space and therefore will struggle to
    //        access the method arguments signature.
    //        There are two methods that can be considered:
    //           - get the object definition by querying the server
    //           - load a fake address space to have some thing to query on our end
    // var request = self._client.factory.constructObjectId("CallRequest",{ methodsToCall: methodsToCall});
    var request = new call_service.CallRequest({methodsToCall: methodsToCall});

    self.performMessageTransaction(request, function (err, response) {

        if (err) {
            callback(err);
        } else {
            assert(response instanceof call_service.CallResponse);
            callback(null, response.results);
        }
    });

};

/**
 * @method getMonitoredItems
 * @param subscriptionId {UInt32} the subscription Id to return
 * @param callback {Function}
 * @param callback.err {Error}
 * @param callback.monitoredItems the monitored Items
 * @param callback.monitoredItems the monitored Items
 */
ClientSession.prototype.getMonitoredItems = function (subscriptionId, callback) {

    // <UAObject NodeId="i=2253"  BrowseName="Server">
    // <UAMethod NodeId="i=11492" BrowseName="GetMonitoredItems" ParentNodeId="i=2253" MethodDeclarationId="i=11489">
    // <UAMethod NodeId="i=11489" BrowseName="GetMonitoredItems" ParentNodeId="i=2004">
    var self = this;
    var methodsToCall =
        new call_service.CallMethodRequest({
            objectId: coerceNodeId("ns=0;i=2253"),  // ObjectId.Server
            methodId: coerceNodeId("ns=0;i=11492"), // MethodIds.Server_GetMonitoredItems;
            inputArguments: [
                // BaseDataType
                {dataType: DataType.UInt32, value: subscriptionId}
            ]
        });

    self.call([methodsToCall], function (err, result, diagnosticInfo) {

            if (err) {
                return callback(err);
            }
            result = result[0];
            diagnosticInfo = diagnosticInfo ? diagnosticInfo[0] : null;
            //xx console.log(" xxxxxxxxxxxxxxxxxx RRR err",err);
            //xx console.log(" xxxxxxxxxxxxxxxxxx RRR result ".red.bold,result.toString());
            //xx console.log(" xxxxxxxxxxxxxxxxxx RRR err",diagnosticInfo);
            if (result.statusCode !== StatusCodes.Good) {

                callback(new Error(result.statusCode.toString()), result, diagnosticInfo);

            } else {

                assert(result.outputArguments.length === 2);
                var data = {
                    serverHandles:  result.outputArguments[0].value, //
                    clientHandles: result.outputArguments[1].value
                };
                assert(_.isArray(data.serverHandles));
                assert(_.isArray(data.clientHandles));
                callback(null, data, diagnosticInfo);
            }
        }
    );
};



/**
 * extract the argument definition of a method
 * @method getArgumentDefinition
 * @param methodId {NodeId}
 * @param callback  {Function}
 * @param {Error|null} callback.err
 * @param {Argument<>} callback.inputArguments
 * @param {Argument<>} callback.outputArguments
 */
ClientSession.prototype.getArgumentDefinition = function (methodId, callback) {

    assert(_.isFunction(callback));
    assert(methodId instanceof NodeId);
    var self = this;

    var browseDescription = [{
        nodeId: methodId,
        referenceTypeId: resolveNodeId("HasProperty"),
        browseDirection: browse_service.BrowseDirection.Forward,
        nodeClassMask: 0,// browse_service.makeNodeClassMask("Variable"),
        includeSubtypes: true,
        resultMask: browse_service.makeResultMask("BrowseName")
    }];

    //Xx console.log("xxxx browseDescription", util.inspect(browseDescription, {colors: true, depth: 10}));
    self.browse(browseDescription, function (err, results) {

        if (err) {
            return callback(err);
        }

        //xx console.log("xxxx results", util.inspect(results, {colors: true, depth: 10}));
        var inputArgument = results[0].references.filter(function (r) {
            return r.browseName.name === "InputArguments"
        });
        if (inputArgument.length === 0) {
            return callback(new Error("cannot find InputArguments for method "));
        }
        inputArgument = inputArgument[0];

        var outputArgument = results[0].references.filter(function (r) {
            return r.browseName.name === "OutputArguments"
        });
        if (outputArgument.length === 0) {
            return callback(new Error("cannot find OutputArguments for method "));
        }
        outputArgument = outputArgument[0];

        //xx console.log("xxxx argument", util.inspect(argument, {colors: true, depth: 10}));
        //xx console.log("xxxx argument nodeId", argument.nodeId.toString());

        var nodesToRead = [
            {
                nodeId: inputArgument.nodeId,
                attributeId: read_service.AttributeIds.Value
            },
            {
                nodeId: outputArgument.nodeId,
                attributeId: read_service.AttributeIds.Value
            }
        ];

        // now read the variable
        self.read(nodesToRead, function (err, nodesToRead, result) {

            if (err) {
                return callback(err);
            }
            //Xx console.log("xxxx result", util.inspect(result, {colors: true, depth: 10}));
            var inputArguments = result[0].value.value;
            var outputArguments = result[1].value.value;
            callback(null, inputArguments, outputArguments);
        });
    });
};

exports.ClientSession = ClientSession;

