"""Independent SSH JSON-lines workspace transport."""
import json
from pathlib import Path
import sys
import transport

config=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
raise SystemExit(transport.serve(config))
