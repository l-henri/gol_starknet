import sys, json, urllib.request

RPC = "https://api.cartridge.gg/x/starknet/sepolia"

def trace(h):
    body = json.dumps({"jsonrpc":"2.0","id":1,"method":"starknet_traceTransaction","params":[h]}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req))

def l2(inv):
    er = (inv or {}).get("execution_resources", {}) or {}
    return er.get("l2_gas")

def walk(inv, depth=0):
    if not inv:
        return
    sel = inv.get("entry_point_selector", "") or ""
    print("    " + "  " * depth + "l2_gas=%12s  sel=%s  ncalls=%d" % (
        "{:,}".format(l2(inv)) if l2(inv) is not None else "None", sel[:16], len(inv.get("calls", []) or [])))
    for c in inv.get("calls", []) or []:
        walk(c, depth + 1)

for label, h in [("AGENT n=60", sys.argv[1]), ("READY n=60", sys.argv[2])]:
    print("=" * 18, label, "=" * 18)
    d = trace(h)
    if "error" in d:
        print("  TRACE ERROR:", d["error"].get("message"))
        continue
    t = d["result"]
    for ph in ("validate_invocation", "execute_invocation", "fee_transfer_invocation"):
        inv = t.get(ph)
        if inv is None:
            print("  %s: (none)" % ph)
            continue
        v = l2(inv)
        print("  %s: l2_gas=%s" % (ph, "{:,}".format(v) if v is not None else "None"))
        if ph == "execute_invocation":
            for c in inv.get("calls", []) or []:
                walk(c, 1)
