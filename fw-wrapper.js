module.exports.getPrefix = () => (typeof FW !== "undefined") ? FW.prefix : "";
module.exports.getLocale = () => (typeof FW !== "undefined") ? FW.Locale : "en-US";
module.exports.getPath = () => (typeof FW !== "undefined") ? FW.path : window.location.pathname;
module.exports.getCurrency = () => (typeof FW !== "undefined") ? FW.Context.c : "USD";
module.exports.getContext = () => (typeof FW !== "undefined") ? FW.Context : {};
module.exports.getToken = () => (typeof FW !== "undefined") ? FW.token : undefined;
module.exports.getUrl = () => (typeof FW !== "undefined") ? FW.URL : {path: window.location.pathname, full: window.location.href};
module.exports.getSiteStatic = () => (typeof FW !== "undefined") ? FW.site_static : true;
module.exports.getCallUrlPrefix = () => (typeof FW !== "undefined") ? FW.call_url_prefix : "https://hub.atonline.com";
module.exports.getUuid = () => (typeof FW !== "undefined") ? FW.uuid : undefined;
module.exports.getInitialState = () => (typeof FW !== "undefined") ? FW.initial : undefined;
module.exports.supported = () => true;
module.exports.GET = (typeof FW !== "undefined") ? FW.GET : {};
module.exports.Get = (key) => {
    if(key===undefined)
        return (typeof FW !== "undefined") ? FW.GET : undefined;

    return (typeof FW !== "undefined") ? FW.GET[key] : undefined;
}
module.exports.getMode = () => (typeof FW !== "undefined") ? FW.mode : "offline";
