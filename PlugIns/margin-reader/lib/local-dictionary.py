"""Read an installed macOS dictionary through Apple's public Dictionary Services.
No application is opened and no user document or configuration is modified.
"""
import ctypes
import json
import sys

class CFRange(ctypes.Structure):
    _fields_ = [("location", ctypes.c_long), ("length", ctypes.c_long)]

def main():
    value = json.loads(sys.stdin.buffer.read(4096).decode("utf-8"))
    word = value.get("term", "")
    if not isinstance(word, str) or not word.strip() or len(word) > 256:
        raise ValueError("Invalid dictionary term")
    cf = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
    ds = ctypes.CDLL("/System/Library/Frameworks/CoreServices.framework/Frameworks/DictionaryServices.framework/DictionaryServices")
    cf.CFStringCreateWithBytes.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_uint32, ctypes.c_bool]
    cf.CFStringCreateWithBytes.restype = ctypes.c_void_p
    cf.CFStringGetLength.argtypes = [ctypes.c_void_p]
    cf.CFStringGetLength.restype = ctypes.c_long
    cf.CFStringGetCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_uint32]
    cf.CFStringGetCString.restype = ctypes.c_bool
    cf.CFRelease.argtypes = [ctypes.c_void_p]
    ds.DCSCopyTextDefinition.argtypes = [ctypes.c_void_p, ctypes.c_void_p, CFRange]
    ds.DCSCopyTextDefinition.restype = ctypes.c_void_p
    raw = word.encode("utf-8")
    term = cf.CFStringCreateWithBytes(None, raw, len(raw), 0x08000100, False)
    if not term:
        raise ValueError("Unable to create dictionary input")
    result = None
    try:
        result = ds.DCSCopyTextDefinition(None, term, CFRange(0, cf.CFStringGetLength(term)))
        definition = ""
        if result:
            size = min(1024 * 1024, (cf.CFStringGetLength(result) + 1) * 4)
            buffer = ctypes.create_string_buffer(size)
            if cf.CFStringGetCString(result, buffer, size, 0x08000100):
                definition = buffer.value.decode("utf-8")
        print(json.dumps({"term": word, "definition": definition, "found": bool(definition), "source": "macOS Dictionary Services"}, ensure_ascii=False))
    finally:
        if result:
            cf.CFRelease(result)
        cf.CFRelease(term)

if __name__ == "__main__":
    main()
