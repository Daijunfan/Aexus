"""Nonblocking, lossless PTY input; partial writes keep their request identity."""
from collections import deque


class PendingWriter:
    def __init__(self, write, acknowledge, quantum=16384):
        self.write = write
        self.acknowledge = acknowledge
        self.quantum = quantum
        self.queue = deque()

    def __bool__(self):
        return bool(self.queue)

    def append(self, request):
        self.queue.append([memoryview(request['data'].encode('utf-8')), request.get('inputId')])

    def drain(self):
        # One bounded write per selector turn lets reads and Ctrl+C make progress.
        if not self.queue:
            return
        remaining, input_id = self.queue[0]
        if remaining:
            try:
                count = self.write(remaining[:self.quantum])
            except (BlockingIOError, InterruptedError):
                return
            if not count:
                raise BrokenPipeError('Terminal input pipe closed')
            remaining = remaining[count:]
            self.queue[0][0] = remaining
        if not remaining:
            self.queue.popleft()
            if input_id is not None:
                self.acknowledge(input_id)
