import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / 'Runtime'))
from terminal_io import PendingWriter


class TerminalWrite(unittest.TestCase):
    def write(self, data, sizes):
        received = bytearray()
        def partial(_fd, remaining):
            count = min(next(sizes), len(remaining))
            received.extend(remaining[:count])
            return count
        acknowledged = []
        writer = PendingWriter(lambda remaining: partial(1, remaining), acknowledged.append)
        writer.append({'data': data.decode(), 'inputId': 7})
        while writer:
            writer.drain()
        self.assertEqual(acknowledged, [7])
        return bytes(received)

    def test_short_writes_preserve_multibyte_input(self):
        data = 'abc中文😀xyz'.encode()
        self.assertEqual(self.write(data, iter([1] * len(data))), data)

    def test_closed_pipe_is_reported(self):
        with self.assertRaises(BrokenPipeError):
            self.write(b'abc', iter([0]))

    def test_blocked_write_keeps_order_and_acknowledges_only_complete_input(self):
        received, acknowledged = bytearray(), []
        blocked = True
        def write(data):
            nonlocal blocked
            if blocked:
                blocked = False
                raise BlockingIOError()
            received.extend(data[:1])
            return 1
        writer = PendingWriter(write, acknowledged.append)
        writer.append({'data': '中', 'inputId': 1})
        writer.append({'data': 'abc', 'inputId': 2})
        writer.drain()
        self.assertTrue(writer)
        self.assertEqual(acknowledged, [])
        writer.drain();writer.drain()
        self.assertEqual(acknowledged, [])
        writer.drain()
        self.assertEqual(acknowledged, [1])
        while writer:
            writer.drain()
        self.assertEqual(bytes(received), '中abc'.encode())
        self.assertEqual(acknowledged, [1, 2])


if __name__ == '__main__':
    unittest.main()
