var argv = require('optimist')
    .usage('Usage: $0 --clear --verbose ')
    .argv;

var path = require("path");
var fs = require("fs");

function remove_files_in_folder(dirPath, removeSelf) {

    console.log(" removing files in ", dirPath);

    if (removeSelf === undefined) {
        removeSelf = true;
    }
    var files;
    try {
        files = fs.readdirSync(dirPath);
    }
    catch (e) {
        return;
    }
    if (files.length > 0) {
        for (var i = 0; i < files.length; i++) {
            var filePath = dirPath + '/' + files[i];
            if (fs.statSync(filePath).isFile()) {

                console.log(" .... deleting  ",filePath);
                fs.unlinkSync(filePath);
            } else {
                remove_files_in_folder(filePath);
            }

        }
    }
    if (removeSelf) {
        fs.rmdirSync(dirPath);
    }
}

Error.stackTraceLimit = Infinity;
//
// options :
//   --clear : delete all files in _generated_ folder first
//   --verbose:
if (argv.clear) {

    console.log(" cleaning _generated_ folder");

    remove_files_in_folder(path.normalize(path.join(__dirname, "../_generated_")), false);


}
if (argv.verbose) {
    require("../lib/misc/factories").verbose = true;
}

// make sure ExtensionObject is defined
require("../lib/misc/extension_object");

var registerObject = require("../lib/misc/factories").registerObject;

registerObject("TCPErrorMessage");

registerObject("QualifiedName");
registerObject("LocalizedText");
registerObject("DiagnosticInfo");
registerObject("RequestHeader");
registerObject("ResponseHeader");
registerObject("AcknowledgeMessage");
registerObject("HelloMessage");
registerObject("ErrorMessage");
registerObject("Variant");
registerObject("BuildInfo");


// browse service
registerObject("ViewDescription");
// browse direction
registerObject("ReferenceDescription");
registerObject("BrowseResult");
registerObject("BrowseDescription");
registerObject("BrowseRequest");
registerObject("BrowseResponse");

registerObject("BrowseNextRequest");
registerObject("BrowseNextResponse");

///
registerObject("ApplicationDescription");
registerObject("UserTokenPolicy");

registerObject("EndpointDescription");
registerObject("GetEndpointsRequest");
registerObject("GetEndpointsResponse");
registerObject("ApplicationInstanceCertificate");

registerObject("OpenSecureChannelRequest");
registerObject("ChannelSecurityToken");
registerObject("OpenSecureChannelResponse");

registerObject("CloseSecureChannelRequest");
registerObject("CloseSecureChannelResponse");
registerObject("ServiceFault");
registerObject("SignedSoftwareCertificate");
registerObject("SignatureData");

registerObject("CreateSessionRequest");
registerObject("CreateSessionResponse");

registerObject("ActivateSessionRequest");
registerObject("ActivateSessionResponse");

registerObject("CloseSessionRequest");
registerObject("CloseSessionResponse");

registerObject("CancelRequest");
registerObject("CancelResponse");

registerObject("AnonymousIdentityToken");
registerObject("UserNameIdentityToken");
registerObject("X509IdentityToken");
registerObject("IssuedIdentityToken");

registerObject("DataValue");

registerObject("EUInformation");
registerObject("Range");
registerObject("AxisInformation");

registerObject("ReadValueId");
registerObject("ReadRequest");
registerObject("ReadResponse");


// subscription service
//xx registerObject("MonitoringMode");
registerObject("CreateSubscriptionRequest");
registerObject("CreateSubscriptionResponse");
registerObject("ModifySubscriptionRequest");
registerObject("ModifySubscriptionResponse");
registerObject("MonitoringParameters");
registerObject("MonitoredItemCreateRequest");
registerObject("MonitoredItemCreateResult");
registerObject("CreateMonitoredItemsRequest");
registerObject("CreateMonitoredItemsResponse");
registerObject("SubscriptionAcknowledgement");
registerObject("PublishRequest");
registerObject("NotificationMessage");
registerObject("PublishResponse");
registerObject("RepublishRequest");
registerObject("RepublishResponse");
registerObject("DeleteMonitoredItemsRequest");
registerObject("DeleteMonitoredItemsResponse");
registerObject("SetPublishingModeRequest");
registerObject("SetPublishingModeResponse");
registerObject("DeleteSubscriptionsRequest");
registerObject("DeleteSubscriptionsResponse");
registerObject("MonitoredItemNotification");
registerObject("DataChangeNotification");
registerObject("MonitoredItemModifyRequest");
registerObject("MonitoredItemModifyResult");
registerObject("ModifyMonitoredItemsRequest");
registerObject("ModifyMonitoredItemsResponse");

// secure_channel_service
registerObject("AsymmetricAlgorithmSecurityHeader");
registerObject("SymmetricAlgorithmSecurityHeader");
registerObject("SequenceHeader");

// Historizing service
registerObject("AggregateConfiguration");
registerObject("HistoryReadValueId");
registerObject("HistoryReadRequest");
registerObject("HistoryReadResult");
registerObject("HistoryReadResponse");
registerObject("HistoryReadDetails");
registerObject("MonitoringFilter");


// translate_browse_path_to_node_is
registerObject("RelativePathElement");
registerObject("RelativePath");
registerObject("BrowsePath");
registerObject("TranslateBrowsePathsToNodeIdsRequest");
registerObject("BrowsePathTarget");
registerObject("BrowsePathResult");
registerObject("TranslateBrowsePathsToNodeIdsResponse");


// BaseDataType
registerObject("Argument");
//xx registerObject("BaseDataType");

// ContentFilter
registerObject("FilterOperand");

registerObject("SimpleAttributeOperand");
registerObject("ElementOperand");
registerObject("LiteralOperand");
registerObject("AttributeOperand");
registerObject("ContentFilterElement");
registerObject("ContentFilter");

registerObject("EventFilter");
registerObject("ReadEventDetails");
registerObject("ReadRawModifiedDetails");
registerObject("ReadProcessedDetails");
registerObject("ReadAtTimeDetails");

// Call service
registerObject("CallMethodRequest");
registerObject("CallMethodResult");
registerObject("CallRequest");
registerObject("CallResponse");


// Register Server Service

registerObject("RegisteredServer");
registerObject("RegisterServerRequest");
registerObject("RegisterServerResponse");

registerObject("FindServersRequest");
registerObject("FindServersResponse");


// write
registerObject("WriteValue");
registerObject("WriteRequest");
registerObject("WriteResponse");


// -------------------------------------------------------------------------
var path = require("path");
var filename = path.join(__dirname, "../nodesets/Opc.Ua.NodeSet2.xml");

var address_space = require("../lib/address_space/address_space");
var AddressSpace = address_space.AddressSpace;

var generate_address_space = require("../lib/address_space/load_nodeset2").generate_address_space;

var makeServerStatus = require("../lib/address_space/convert_nodeset_to_types").makeServerStatus;


var aspace = new AddressSpace();

generate_address_space(aspace, filename, function () {

    makeServerStatus(aspace);

});

