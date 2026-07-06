import json, urllib.request, datetime
RPC="https://api.cartridge.gg/x/starknet/sepolia"
CLS="0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f"

def rpc(m,p):
    body=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode()
    req=urllib.request.Request(RPC,data=body,headers={"Content-Type":"application/json"})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        return {"http_error": e.code, "body": e.read().decode()[:200]}

def declared_at(block):
    """True if class is declared at <= block."""
    r=rpc("starknet_getClass",[{"block_number":block}, CLS])
    if "result" in r: return True
    err=r.get("error",{})
    code=err.get("code")
    # 28 = Class hash not found (not yet declared); 24 = Block not found
    return ("not_found", code, err.get("message"))

def head():
    return rpc("starknet_getBlockWithTxHashes",["latest"])["result"]["block_number"]

# probe behaviour at a few heights
print("probe block 1:", declared_at(1))
print("probe block 5,000,000:", declared_at(5_000_000))
print("probe block 8,000,000:", declared_at(8_000_000))
hi=head(); print("head block:", hi)
print("probe head:", declared_at(hi))

# binary search for first block where declared_at is True
def is_decl(b):
    r=declared_at(b)
    return r is True

lo, hiB = 1, hi
# ensure declared at head
if not is_decl(hiB):
    print("NOT declared at head?!"); raise SystemExit
# find a lo that is NOT declared
if is_decl(lo):
    print("declared at block 1 already (regenesis floor)");
else:
    while hiB - lo > 1:
        mid=(lo+hiB)//2
        r=declared_at(mid)
        if r is True:
            hiB=mid
        elif isinstance(r,tuple) and r[1]==28:
            lo=mid
        else:
            # block-not-found or other: nudge up
            print("  ambiguous at",mid,r); lo=mid
    print("first declared block:", hiB)
    blk=rpc("starknet_getBlockWithTxHashes",[{"block_number":hiB}])["result"]
    ts=blk["timestamp"]
    print("block", hiB, "timestamp", ts, "=", datetime.datetime.utcfromtimestamp(ts).isoformat()+"Z")
