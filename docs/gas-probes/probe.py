import json, urllib.request

RPC = "https://api.cartridge.gg/x/starknet/sepolia"

def rpc(method, params):
    body = json.dumps({"jsonrpc":"2.0","id":1,"method":method,"params":params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req))

AGENT_TX = "0x3cefb93f9719d8c02ac1928791b196bb64271ffd85b0959a0eaf2d4c8eb18b3"
READY_TX = "0x03825fc82090bc61f64e990ed1c0376f7b4dbe5bc534c27e667a0f274fc425d2"
AGENT_ACCT = "0x026d87a881bc82eb038c4cc214fbccd16ea72b424b523a7b2b2551a2e495e70f"
READY_ACCT = "0x46e460252f57769cfeb9e82c1426e9a8c253b5b9fdc2b07c27dee8820eebcdf"

def inner(txh):
    t = rpc("starknet_traceTransaction", [txh])["result"]
    exe = t["execute_invocation"]
    call = (exe.get("calls") or [exe])[0]
    return exe, call

for label, txh in [("AGENT", AGENT_TX), ("READY", READY_TX)]:
    exe, call = inner(txh)
    print("====", label, "execute_invocation keys:", sorted(exe.keys()))
    print("     execute tracked_resource:", exe.get("tracked_resource"))
    print("     execute execution_resources:", exe.get("execution_resources"))
    print("     INNER call keys:", sorted(call.keys()))
    print("     INNER tracked_resource:", call.get("tracked_resource"))
    print("     INNER execution_resources:", call.get("execution_resources"))
    print()

# account class versions
for label, acct in [("AGENT", AGENT_ACCT), ("READY", READY_ACCT)]:
    ch = rpc("starknet_getClassHashAt", ["latest", acct])["result"]
    cls = rpc("starknet_getClass", ["latest", ch])["result"]
    sp = cls.get("sierra_program", [])
    # sierra_program[0..2] encodes the sierra version (major, minor, patch) as felts
    ver = [int(x, 16) for x in sp[:3]] if sp else None
    print(f"==== {label} class_hash={ch}")
    print(f"     sierra version (program[0:3]) = {ver}")
    print(f"     entry points sierra? {'sierra_program' in cls}  contract_class_version={cls.get('contract_class_version')}")
