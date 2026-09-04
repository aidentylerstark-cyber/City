// =============================================================================
//  City Link — Verification Terminal
// =============================================================================
//
//  Rez this anywhere in Second Life. When a resident touches it, it asks City
//  Link whether a verification code is waiting for them, and IMs it to them
//  privately.
//
//  Why this is the identity proof: the object reports the toucher's key and
//  username as *the grid* reports them (llDetectedKey / llGetUsername). A
//  resident cannot lie to the simulator about who they are, and the code is
//  delivered by IM to that avatar and nobody else. Someone who types your
//  username into the website gets nothing — the code goes to you.
//
//  SETUP
//    1. Set CITYLINK_URL to your deployment (no trailing slash).
//    2. Set BRIDGE_SECRET to the SL_BRIDGE_SECRET from your server .env.
//    3. Keep the object no-mod / no-copy for non-owners. The secret is
//       readable by anyone who can open the script.
//
//  SECURITY NOTE
//    Anyone holding BRIDGE_SECRET can call the bridge. That is why the bridge
//    can only *deliver a code to the avatar it names* — it cannot mint
//    accounts, and it cannot reveal a code for anybody but the toucher.
//    Rotate the secret and re-deploy the objects if a copy ever leaks.
//
// =============================================================================

string  CITYLINK_URL   = "https://citylink.example.com";
string  BRIDGE_SECRET  = "change-me-to-match-SL_BRIDGE_SECRET";

string  PATH_DELIVER   = "/api/bridge/deliver";

// Requests currently in flight, as [request_id, avatar_key, ...].
list    g_pending;

integer FLOAT_TEXT     = TRUE;

// -----------------------------------------------------------------------------
//  Signing
// -----------------------------------------------------------------------------
//  signature = SHA256(secret + "|" + SHA256(secret + "|" + payload))
//
//  Not RFC 2104 HMAC: LSL has no way to hash raw bytes, and the HMAC pads
//  produce bytes that a UTF-8 string cannot carry. This nested keyed form is
//  computable here and is what src/lib/sl/bridge.ts verifies.
// -----------------------------------------------------------------------------
string sign(string payload)
{
    string inner = llSHA256String(BRIDGE_SECRET + "|" + payload);
    return llSHA256String(BRIDGE_SECRET + "|" + inner);
}

// The canonical payload. Field order is part of the contract with the server.
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

set_text()
{
    if (!FLOAT_TEXT) return;
    llSetText("City Link\nTouch to receive your verification code", <0.3, 0.7, 1.0>, 1.0);
}

request_code(key avatar)
{
    string username = llGetUsername(avatar);

    if (username == "")
    {
        // Happens if the avatar left the region between touch and here.
        llInstantMessage(avatar, "City Link could not read your username. Stay in the region and touch me again.");
        return;
    }

    string body = llList2Json(JSON_OBJECT, [
        "avatarUuid",        (string)avatar,
        "avatarUsername",    username,
        "avatarDisplayName", llGetDisplayName(avatar),
        "region",            llGetRegionName()
    ]);

    key request_id = post_signed(PATH_DELIVER, body);
    g_pending += [request_id, avatar];
}

default
{
    state_entry()
    {
        set_text();
        // Exact-match filter, so the simulator drops every other chat line
        // before this script ever wakes up.
        llListen(0, "", NULL_KEY, "!citylink");
    }

    on_rez(integer start)
    {
        llResetScript();
    }

    touch_start(integer total)
    {
        integer i;
        for (i = 0; i < total; i++)
        {
            request_code(llDetectedKey(i));
        }
    }

    // Also answer chat, so a resident out of touch range can trigger it.
    listen(integer channel, string name, key id, string message)
    {
        request_code(id);
    }

    http_response(key request_id, integer status, list metadata, string body)
    {
        integer index = llListFindList(g_pending, [request_id]);
        if (index == -1) return;

        key avatar = (key)llList2String(g_pending, index + 1);
        g_pending  = llDeleteSubList(g_pending, index, index + 1);

        if (status != 200)
        {
            llInstantMessage(avatar,
                "City Link is not reachable right now (HTTP " + (string)status + "). Try again in a moment.");
            return;
        }

        string message = llJsonGetValue(body, ["message"]);
        if (message == JSON_INVALID || message == "")
        {
            message = "City Link returned an unexpected response.";
        }

        llInstantMessage(avatar, message);
    }
}
