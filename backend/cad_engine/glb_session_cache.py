"""Per-session GLB byte cache (Epic B / glb-session-cache spec).

A ``GLBSessionCache`` stores serialised GLB payloads keyed by the tuple
``(step_hash, deflection, model_id)``. The cache is bounded by both
entry count and total memory and uses LRU eviction; both limits are
enforced together so callers cannot exhaust memory with a single large
payload.

Designed for per-WebSocket-session use: instantiate one cache per
session in ``backend/agent/tools.py`` and call ``clear()`` on session
teardown (Epic C C9 will wire that automatically).

Concurrency: the cache is internally synchronised with a ``threading.Lock``
so that the parallel STL/GLB phase in ``backend/cad_engine/generator.py``
can safely hit a single instance from multiple threads.
"""

from __future__ import annotations

from collections import OrderedDict
from threading import Lock
from typing import Tuple

CacheKey = Tuple[str, Tuple[float, float], str]


class GLBSessionCache:
    """Bounded LRU cache of GLB payloads keyed by mesh provenance."""

    def __init__(
        self,
        max_entries: int = 20,
        max_bytes: int = 50 * 1024 * 1024,
    ) -> None:
        if max_entries <= 0:
            raise ValueError("max_entries must be positive")
        if max_bytes <= 0:
            raise ValueError("max_bytes must be positive")
        self._max_entries: int = int(max_entries)
        self._max_bytes: int = int(max_bytes)
        self._store: "OrderedDict[CacheKey, bytes]" = OrderedDict()
        self._total_bytes: int = 0
        self._lock = Lock()

    @staticmethod
    def _key(step_hash: str, deflection: tuple[float, float], model_id: str) -> CacheKey:
        if len(deflection) != 2:
            raise ValueError("deflection must be a (linear, angular) pair")
        lin, ang = deflection
        return (str(step_hash), (float(lin), float(ang)), str(model_id))

    def get(
        self,
        step_hash: str,
        deflection: tuple[float, float],
        model_id: str,
    ) -> bytes | None:
        """Return cached bytes, marking the entry as recently used."""
        key = self._key(step_hash, deflection, model_id)
        with self._lock:
            value = self._store.get(key)
            if value is None:
                return None
            self._store.move_to_end(key)
            return value

    def put(
        self,
        step_hash: str,
        deflection: tuple[float, float],
        model_id: str,
        payload: bytes,
    ) -> None:
        """Insert ``payload`` and evict the LRU entries to stay within limits."""
        if payload is None:
            return
        data = bytes(payload)
        key = self._key(step_hash, deflection, model_id)
        with self._lock:
            existing = self._store.pop(key, None)
            if existing is not None:
                self._total_bytes -= len(existing)
            self._store[key] = data
            self._total_bytes += len(data)
            self._evict_locked()

    def clear(self) -> None:
        """Drop all entries; safe to call on session teardown."""
        with self._lock:
            self._store.clear()
            self._total_bytes = 0

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)

    @property
    def total_bytes(self) -> int:
        with self._lock:
            return self._total_bytes

    def _evict_locked(self) -> None:
        while len(self._store) > self._max_entries and self._store:
            _, evicted = self._store.popitem(last=False)
            self._total_bytes -= len(evicted)
        while self._total_bytes > self._max_bytes and self._store:
            _, evicted = self._store.popitem(last=False)
            self._total_bytes -= len(evicted)
        if not self._store:
            self._total_bytes = 0


__all__ = ["GLBSessionCache", "CacheKey"]
