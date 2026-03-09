"""WebSocket hub for real-time execution monitoring."""
import asyncio
from collections import defaultdict
from typing import Optional

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = structlog.get_logger()

router = APIRouter(tags=["websocket"])

_connections: dict[str, set[WebSocket]] = defaultdict(set)
_lock = asyncio.Lock()


async def connect(execution_id: str, websocket: WebSocket):
    """Register a WebSocket connection for an execution."""
    await websocket.accept()
    async with _lock:
        _connections[execution_id].add(websocket)
    logger.debug("ws_connected", execution_id=execution_id)


async def disconnect(execution_id: str, websocket: WebSocket):
    """Unregister a WebSocket connection."""
    async with _lock:
        _connections[execution_id].discard(websocket)
        if not _connections[execution_id]:
            del _connections[execution_id]
    logger.debug("ws_disconnected", execution_id=execution_id)


async def broadcast(execution_id: str, message: dict):
    """Broadcast a message to all clients watching an execution."""
    async with _lock:
        clients = list(_connections.get(execution_id, []))

    for ws in clients:
        try:
            await ws.send_json(message)
        except Exception:
            pass


@router.websocket("/ws/executions/{execution_id}")
async def websocket_endpoint(websocket: WebSocket, execution_id: str):
    """WebSocket endpoint for real-time execution monitoring."""
    await connect(execution_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await disconnect(execution_id, websocket)


def get_active_execution_ids() -> list[str]:
    """Return list of execution IDs with active WebSocket connections."""
    return list(_connections.keys())
