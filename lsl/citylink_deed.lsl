// =============================================================================
//  City Link — Product Deed
// =============================================================================
//
//  This is the object a customer receives when they buy City Link. Rezzing it
//  and touching it registers the owner's product license, which is what unlocks
//  "Create a town" on the website.
//
//  It reports ownership, never identity. An object can be handed to anyone, so
//  what it grants is a *capability* (you may create a town), never an *account*
//  (you are this person). Accounts only ever come from a code delivered to an
//  avatar by the verification terminal.
//
//  The owner must already have a City Link account. If they do not, the object
//  says so and does nothing.
//
//  SETUP
//    1. Set CITYLINK_URL and BRIDGE_SECRET to match your deployment.
//    2. Set PRODUCT_KEY to the edition this object represents.
//    3. Sell it copy/transfer as your license terms require. The license
//       follows the object: if it changes hands, the new owner inherits it on
//       their next touch, and the previous owner loses it.
//
// =============================================================================

string  CITYLINK_URL    = "https://citylink.example.com";
string  BRIDGE_SECRET   = "change-me-to-match-SL_BRIDGE_SECRET";

string  PRODUCT_KEY     = "citylink-standard";
// Towns this edition entitles the owner to run at once. The server clamps it.
integer TOWN_ALLOWANCE  = 1;

string  PATH_DEED       = "/api/bridge/deed";
string  PATH_HEARTBEAT  = "/api/bridge/heartbeat";

// A license goes DORMANT if it stops reporting; it never dies from silence.
float   HEARTBEAT_HOURS = 6.0;

key     g_deed_request;
key     g_heartbeat_request;
key     g_last_owner;

// -----------------------------------------------------------------------------
//  Signing — must match src/lib/sl/bridge.ts exactly.
// -----------------------------------------------------------------------------
string sign(string payload)
{
    string inner = llSHA256String(BRIDGE_SECRET + "|" + payload);
    return llSHA256String(BRIDGE_SECRET + "|" + inner);
}

string signing_payload(string method, string path, string timestamp, string nonce, string body)
{
    return method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + body;
}

key post_signed(string path, string body)
{
    string timestamp = (string)llGetUnixTime();
    string nonce     = (string)llGenerateKey();
    string signature = sign(signing_payload("POST", path, timestamp, nonce, body));

    return llHTTPRequest(
        CITYLINK_URL + path,
        [
            HTTP_METHOD,          "POST",
            HTTP_MIMETYPE,        "application/json",
            HTTP_VERIFY_CERT,     TRUE,
            HTTP_BODY_MAXLENGTH,  16384,
            HTTP_CUSTOM_HEADER,   "X-CityLink-Timestamp", timestamp,
            HTTP_CUSTOM_HEADER,   "X-CityLink-Nonce",     nonce,
            HTTP_CUSTOM_HEADER,   "X-CityLink-Signature", signature,
            HTTP_CUSTOM_HEADER,   "X-CityLink-Object",    (string)llGetKey()
        ],
        body
    );
}

// -----------------------------------------------------------------------------

register_deed()
{
    key owner        = llGetOwner();
    string username  = llGetUsername(owner);

    if (username == "")
    {
        // llGetUsername only answers for agents in the region. Fall back to the
        // legacy name, which the server normalises the same way.
        username = llKey2Name(owner);
    }

    if (username == "")
    {
        llOwnerSay("City Link could not read your username. Stand next to me and touch me again.");
        return;
    }

    string body = llList2Json(JSON_OBJECT, [
        "ownerUuid",      (string)owner,
        "ownerUsername",  username,
        "objectUuid",     (string)llGetKey(),
        "objectName",     llGetObjectName(),
        "productKey",     PRODUCT_KEY,
        "region",         llGetRegionName(),
        "townAllowance",  (string)TOWN_ALLOWANCE
    ]);

    // llList2Json emits every value as a JSON string; the server coerces
    // townAllowance back to a number rather than us splicing quotes here.
    g_deed_request = post_signed(PATH_DEED, body);
}

send_heartbeat()
{
    string body = llList2Json(JSON_OBJECT, [
        "objectUuid", (string)llGetKey(),
        "region",     llGetRegionName()
    ]);

    g_heartbeat_request = post_signed(PATH_HEARTBEAT, body);
}

default
{
    state_entry()
    {
        g_last_owner = llGetOwner();
        llSetText("City Link License\nTouch to register", <1.0, 0.75, 0.2>, 1.0);
        llSetTimerEvent(HEARTBEAT_HOURS * 3600.0);
    }

    on_rez(integer start)
    {
        llResetScript();
    }

    changed(integer change)
    {
        // The object changed hands — the license follows it.
        if (change & CHANGED_OWNER)
        {
            llResetScript();
        }
    }

    touch_start(integer total)
    {
        if (llDetectedKey(0) != llGetOwner())
        {
            llInstantMessage(llDetectedKey(0), "This City Link license belongs to someone else.");
            return;
        }

        register_deed();
    }

    timer()
    {
        send_heartbeat();
    }

    http_response(key request_id, integer status, list metadata, string body)
    {
        if (request_id == g_heartbeat_request) return;
        if (request_id != g_deed_request) return;

        if (status != 200)
        {
            llOwnerSay("City Link is not reachable right now (HTTP " + (string)status + ").");
            return;
        }

        string message = llJsonGetValue(body, ["message"]);
        if (message == JSON_INVALID || message == "")
        {
            message = "City Link returned an unexpected response.";
        }

        llOwnerSay(message);
    }
}
