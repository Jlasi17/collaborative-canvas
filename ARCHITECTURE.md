# Architecture Documentation

## 📐 System Overview

The Collaborative Canvas application is built with a client-server architecture using WebSockets for real-time bidirectional communication. The system is designed to handle multiple concurrent users drawing simultaneously on a shared canvas.

## 🔄 Data Flow Diagram

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Client 1  │◄──────────────────────────►│             │
│             │                             │   Server    │
└─────────────┘                             │             │
                                            │  (Socket.io)│
┌─────────────┐                             │             │
│   Client 2  │◄──────────────────────────►│             │
│             │                             │             │
└─────────────┘                             └─────────────┘
       │                                            │
       │                                            │
       ▼                                            ▼
┌─────────────┐                             ┌─────────────┐
│   Canvas    │                             │Room Manager │
│   Manager   │                             │             │
└─────────────┘                             └─────────────┘
       │                                            │
       │                                            │
       ▼                                            ▼
┌─────────────┐                             ┌─────────────┐
│  Drawing    │                             │Drawing State│
│  Operations │                             │  Manager    │
└─────────────┘                             └─────────────┘
```

### Drawing Event Flow

1. **User Action**: User starts drawing on canvas
2. **Local Rendering**: Canvas immediately renders the stroke locally (optimistic UI)
3. **Event Emission**: Drawing events sent to server via WebSocket
4. **Server Processing**: Server validates and broadcasts to other clients
5. **Remote Rendering**: Other clients receive and render the drawing
6. **State Update**: Server maintains operation history for undo/redo

## 🔌 WebSocket Protocol

### Message Types

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join-room` | `{ roomId, userData }` | User joins a room |
| `draw-start` | `{ operationId, tool, color, lineWidth }` | Start of a drawing stroke |
| `draw-point` | `{ operationId, point: {x, y} }` | Point in a drawing stroke |
| `draw-end` | `{ operationId, tool, color, lineWidth }` | End of a drawing stroke |
| `cursor-move` | `{ x, y }` | User cursor position update |
| `undo` | `{}` | Undo last operation |
| `redo` | `{}` | Redo last undone operation |
| `clear-canvas` | `{}` | Clear entire canvas |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room-state` | `{ users, drawingHistory, canvasState }` | Initial room state on join |
| `draw-start` | `{ operationId, tool, color, lineWidth, userId }` | Remote user started drawing |
| `draw-point` | `{ operationId, point, userId }` | Remote user drawing point |
| `draw-end` | `{ operationId, tool, color, lineWidth, userId }` | Remote user finished drawing |
| `cursor-move` | `{ x, y, userId }` | Remote user cursor position |
| `undo` | `{ operationId, userId }` | Operation was undone |
| `redo` | `{ operationId, userId }` | Operation was redone |
| `clear-canvas` | `{ userId }` | Canvas was cleared |
| `user-joined` | `{ id, name, color }` | New user joined room |
| `user-left` | `{ userId }` | User left room |

### Message Serialization

All messages are JSON-encoded. Drawing points use pixel coordinates relative to the canvas.

**Example Draw Point Message:**
```json
{
  "operationId": "local-1234567890-0.123",
  "point": {
    "x": 150.5,
    "y": 200.3
  }
}
```

## 🎨 Canvas Drawing Strategy

### Path Optimization

Instead of drawing each point as a separate line segment, the system uses:

1. **Immediate Rendering**: Points are drawn as they arrive for smooth UX
2. **Quadratic Curves**: On completion, paths are smoothed using quadratic curves
3. **Path Storage**: Complete paths stored as point arrays for undo/redo

### Layer Management

The application uses two canvas layers:

1. **Drawing Canvas** (`#drawingCanvas`): Permanent drawing layer
2. **Cursor Canvas** (`#cursorCanvas`): Temporary cursor indicators (redrawn on each update)

This separation allows cursor updates without redrawing the entire canvas.

### Drawing Operations

```javascript
// Operation Structure
{
  id: "unique-operation-id",
  type: "draw",
  tool: "brush" | "eraser",
  color: "#000000",
  lineWidth: 5,
  userId: "user-id",
  timestamp: 1234567890,
  points: [{x, y}, {x, y}, ...]
}
```

## 🔄 Undo/Redo Strategy

### Global Undo/Redo Implementation

The undo/redo system maintains consistency across all clients:

1. **Operation History**: Server maintains a linear history of all operations
2. **Undo Stack**: Operations moved to undo stack when undone
3. **Broadcast**: Undo/redo actions broadcast to all clients
4. **Client Sync**: Clients remove/restore operations from their local history

### Conflict Resolution

**Scenario**: User A undoes while User B is drawing

**Solution**:
- Undo operations are queued and processed after active drawings complete
- Operation IDs ensure correct operation removal
- Timestamp-based ordering maintains consistency

**Implementation**:
```javascript
// Server-side undo
undo() {
  if (this.history.length === 0) return null;
  const operation = this.history.pop();
  this.undoStack.push(operation);
  return operation; // Broadcast to all clients
}
```

### State Consistency

- **New User Joining**: Receives complete history and rebuilds canvas
- **Operation Ordering**: Timestamps ensure operations applied in correct order
- **Race Conditions**: Operation IDs prevent duplicate processing

## ⚡ Performance Decisions

### 1. Point-by-Point Updates

**Decision**: Send each drawing point individually rather than batching

**Rationale**:
- Provides true real-time feel (users see drawing as it happens)
- Low latency for smooth collaborative experience
- Acceptable for typical drawing speeds

**Trade-off**: Higher message frequency, but WebSocket handles this efficiently

### 2. Optimistic UI Updates

**Decision**: Render locally before server confirmation

**Rationale**:
- Immediate feedback for user
- Reduces perceived latency
- Server still validates and broadcasts

**Trade-off**: Potential for temporary inconsistencies (rare)

### 3. Quadratic Curve Smoothing

**Decision**: Use quadratic curves instead of many line segments

**Rationale**:
- Smoother visual appearance
- Fewer points to store
- Better performance on redraw

**Trade-off**: Slightly more complex rendering logic

### 4. Dual Canvas Layers

**Decision**: Separate drawing and cursor canvases

**Rationale**:
- Cursor updates don't require full redraw
- Better performance for frequent cursor movements
- Cleaner separation of concerns

**Trade-off**: Slightly more memory usage

### 5. In-Memory State Management

**Decision**: Store all operations in memory (no database)

**Rationale**:
- Fast access for undo/redo
- Simple implementation
- Sufficient for demo/assessment

**Trade-off**: Lost on server restart, memory grows with usage

## 🛡️ Conflict Resolution

### Simultaneous Drawing

**Problem**: Multiple users draw in overlapping areas

**Solution**: 
- Each operation is independent
- Canvas composite operations handle overlapping correctly
- No explicit locking (users can draw anywhere)

**Result**: Natural collaborative experience, like real whiteboard

### Undo Conflicts

**Problem**: User A undoes while User B draws

**Solution**:
- Undo removes specific operation by ID
- Active drawings continue normally
- Undone operations can be redone

**Result**: Undo/redo works correctly even during active drawing

### Network Latency

**Problem**: Network delays cause out-of-order messages

**Solution**:
- Operation IDs ensure correct association
- Timestamps for ordering
- Client-side buffering for active operations

**Result**: Smooth experience even with network issues

## 🔐 Security Considerations

### Current Implementation

- **No Authentication**: Anyone can join and draw
- **No Rate Limiting**: No protection against spam
- **No Input Validation**: Basic validation only
- **No Sanitization**: User names not sanitized

### Production Recommendations

1. **Authentication**: User login/session management
2. **Rate Limiting**: Limit drawing events per second
3. **Input Validation**: Validate all coordinates, colors, etc.
4. **Sanitization**: Sanitize user names and prevent XSS
5. **Authorization**: Room-based permissions
6. **Encryption**: WSS (WebSocket Secure) for HTTPS

## 📈 Scaling Considerations

### Current Limitations

- Single server instance
- In-memory state (lost on restart)
- No horizontal scaling support

### Scaling to 1000+ Users

**Recommended Architecture**:

1. **Load Balancing**: Multiple server instances behind load balancer
2. **Redis Pub/Sub**: Shared state and message broadcasting
3. **Database**: Persistent operation history
4. **Room Sharding**: Distribute rooms across servers
5. **CDN**: Serve static assets
6. **Message Queue**: Handle high-frequency events

**Example Scaling Strategy**:
```
                    ┌─────────────┐
                    │ Load Balancer│
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
   │ Server 1│        │ Server 2│        │ Server 3│
   └────┬────┘        └────┬────┘        └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Redis Pub/Sub│
                    └─────────────┘
```

## 🧪 Testing Strategy

### Manual Testing

1. **Multi-User**: Open multiple browser windows
2. **Network Simulation**: Use browser dev tools to throttle network
3. **Stress Test**: Rapid drawing to test performance
4. **Edge Cases**: Undo during drawing, clear during active session

### Automated Testing (Future)

- Unit tests for drawing operations
- Integration tests for WebSocket communication
- E2E tests for user workflows
- Performance tests for large operation histories

## 📝 Code Organization

### Separation of Concerns

- **`canvas.js`**: Pure canvas operations, no network code
- **`websocket.js`**: Pure WebSocket communication, no canvas logic
- **`main.js`**: Orchestration and event handling
- **`server.js`**: HTTP and WebSocket server setup
- **`rooms.js`**: User and room management
- **`drawing-state.js`**: Operation history and state

### Design Patterns

- **Observer Pattern**: Event callbacks for WebSocket events
- **State Management**: Centralized drawing state
- **Module Pattern**: ES6 modules for encapsulation

## 🎯 Key Design Decisions

1. **No Frameworks**: Vanilla JS to demonstrate core skills
2. **Socket.io over Native WebSockets**: Easier room management and fallbacks
3. **Point-by-Point Sync**: Real-time feel over batching efficiency
4. **In-Memory State**: Simplicity over persistence
5. **Optimistic UI**: User experience over strict consistency

---

This architecture prioritizes real-time collaboration and smooth user experience while maintaining code clarity and extensibility.

