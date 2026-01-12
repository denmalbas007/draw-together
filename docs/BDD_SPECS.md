# BDD Specifications - Collaborative Drawing Board

## Feature: Real-time Collaborative Drawing

### Scenario: User joins a drawing room
```gherkin
Given a user opens the application
When they enter a room name and nickname
Then they should be connected to the drawing room
And they should see the shared canvas
And other users in the room should see them join
```

### Scenario: User draws on canvas
```gherkin
Given a user is connected to a room
When they draw a stroke on the canvas
Then the stroke should appear on their canvas immediately
And the stroke should be broadcast to all other users in the room
And other users should see the stroke in real-time
```

### Scenario: Multiple users draw simultaneously
```gherkin
Given multiple users are in the same room
When they all draw at the same time
Then all strokes should be visible to everyone
And there should be no conflicts or lost strokes
```

### Scenario: User changes drawing tools
```gherkin
Given a user is in a drawing room
When they select a different brush size or color
Then their next strokes should use the new settings
And other users should see strokes with those settings
```

## Feature: Layer Management

### Scenario: User creates a new layer
```gherkin
Given a user is drawing
When they click "Add Layer"
Then a new layer should be created
And they should be able to draw on the new layer
And layer changes should sync to other users
```

### Scenario: User toggles layer visibility
```gherkin
Given a canvas with multiple layers
When a user hides a layer
Then that layer should become invisible locally
And drawing on hidden layers should still work
```

## Feature: Canvas Persistence

### Scenario: Room state is saved
```gherkin
Given users are drawing in a room
When the canvas has strokes
Then the state should be saved to database
And new users joining should see all existing strokes
```

### Scenario: User exports canvas
```gherkin
Given a user has a drawing
When they click "Export PNG"
Then they should download a merged image of all layers
```

## Feature: Drawing History (Undo/Redo)

### Scenario: User undoes a stroke
```gherkin
Given a user has drawn strokes
When they press Ctrl+Z or click Undo
Then the last stroke should be removed
And the undo should be broadcast to other users
```

