# jsmind-v2 Missing Features Checklist

This document lists the features that are still missing in jsmind-v2 compared to jsmind (original version). jsmind-v2 is a TypeScript rewrite upgrade that aims to include all original features and uses Promise-based asynchronous mode when rendering nodes.

## I. Core Runtime Features (JsMind Main Class)

### 1.1 Display and Initialization
- [ ] `show(mind, skip_centering)` - Display mind map
- [ ] `_show(mind, skip_centering)` - Internal display flow
- [ ] `_reset()` - Reset view/layout/data
- [ ] `init()` - Initialize subsystems (data/layout/view/shortcut) and plugins

### 1.2 Edit Control
- [ ] `get_editable()` - Get whether editable
- [ ] `enable_edit()` - Enable editing
- [ ] `disable_edit()` - Disable editing

### 1.3 View Dragging Control
- [ ] `get_view_draggable()` - Get whether view is draggable
- [ ] `enable_view_draggable()` - Enable view dragging
- [ ] `disable_view_draggable()` - Disable view dragging

### 1.4 Event Handling Control
- [ ] `enable_event_handle(event_handle)` - Enable default event handling (mousedown/click/dblclick/mousewheel)
- [ ] `disable_event_handle(event_handle)` - Disable default event handling

### 1.5 Theme
- [ ] `set_theme(theme)` - Set theme name

## II. Node Operations

### 2.1 Node Lookup
- [x] `get_root()` - Get root node (already available: `mind.root`)
- [x] `get_node(node)` - Get node by ID or node object (already available: `mind.findNodeById()`)
- [ ] `find_node_before(node)` - Find previous sibling node
- [ ] `find_node_after(node)` - Find next sibling node
- [ ] `is_node_visible(node)` - Check if node is visible

### 2.2 Node Selection
- [ ] `select_node(node)` - Select node
- [ ] `get_selected_node()` - Get currently selected node
- [ ] `select_clear()` - Clear selection

### 2.3 Node Addition
- [ ] `add_node(parent_node, node_id, topic, data, direction)` - Add node
- [ ] `add_nodes(parent_node, nodes_data)` - Add multiple nodes (supports nested structure)
- [ ] `insert_node_before(node_before, node_id, topic, data, direction)` - Insert before specified node
- [ ] `insert_node_after(node_after, node_id, topic, data, direction)` - Insert after specified node

### 2.4 Node Deletion
- [ ] `remove_node(node)` - Remove node

### 2.5 Node Update
- [ ] `update_node(node_id, topic)` - Update node topic

### 2.6 Node Movement
- [ ] `move_node(node_id, before_id, parent_id, direction)` - Move node

### 2.7 Node Expand/Collapse
- [ ] `expand_node(node)` - Expand node
- [ ] `collapse_node(node)` - Collapse node
- [ ] `toggle_node(node)` - Toggle node expand/collapse state
- [ ] `expand_all()` - Expand all nodes
- [ ] `collapse_all()` - Collapse all nodes
- [ ] `expand_to_depth(depth)` - Expand to specified depth

### 2.8 Node Editing
- [ ] `begin_edit(node)` - Begin editing node
- [ ] `end_edit()` - End editing

### 2.9 Node Styling
- [ ] `set_node_color(node_id, bg_color, fg_color)` - Set node background and foreground color
- [ ] `set_node_font_style(node_id, size, weight, style)` - Set node font style
- [ ] `set_node_background_image(node_id, image, width, height, rotation)` - Set node background image
- [ ] `set_node_background_rotation(node_id, rotation)` - Set node background image rotation angle

### 2.10 Node Scrolling
- [ ] `scroll_node_to_center(node)` - Scroll to node center

## III. View System (ViewProvider)

### 3.1 View Initialization
- [ ] Complete ViewProvider implementation (currently only JmView interface)
- [ ] Support for both Canvas and SVG rendering engines
- [ ] DOM structure initialization (container, panel, nodes, editor)
- [ ] Node DOM element creation and management
- [ ] Node size measurement and initialization

### 3.2 View Rendering
- [ ] `load()` - Load view
- [ ] `show(skip_centering)` - Show view
- [ ] `relayout()` - Relayout
- [ ] `resize()` - Resize view
- [ ] Node rendering (supports custom render function, uses Promise async mode)
- [ ] Line rendering (supports Canvas and SVG)
- [ ] Custom node render function support (`custom_node_render`)

### 3.3 Node View Operations
- [ ] `add_node(node)` - Add node to view
- [ ] `remove_node(node)` - Remove node from view
- [ ] `update_node(node)` - Update node display
- [ ] `select_node(node)` - Select node (visual feedback)
- [ ] `select_clear()` - Clear selection

### 3.4 Node Editing
- [ ] `edit_node_begin(node)` - Begin editing node
- [ ] `edit_node_end()` - End editing node
- [ ] `get_editing_node()` - Get currently editing node
- [ ] `is_editing()` - Check if editing

### 3.5 View Interaction
- [ ] Mouse event handling (mousedown, click, dblclick)
- [ ] Wheel event handling (mousewheel, supports Ctrl+wheel zoom)
- [ ] Node click selection
- [ ] Node double-click editing
- [ ] Expander click to toggle expand/collapse

### 3.6 Zoom Functionality
- [ ] `zoom_in(event)` - Zoom in
- [ ] `zoom_out(event)` - Zoom out
- [ ] Zoom control (min/max/step/mask_key)
- [ ] Device pixel ratio support (`enable_device_pixel_ratio`)

### 3.7 View Dragging
- [ ] `setup_canvas_draggable(enabled)` - Set canvas draggable
- [ ] Canvas dragging functionality (when mind map is larger than container)
- [ ] Hide scrollbars when draggable option (`hide_scrollbars_when_draggable`)

### 3.8 View Positioning
- [ ] `save_location(node)` - Save node location
- [ ] `restore_location(node)` - Restore node location
- [ ] `center_node(node)` - Center node

### 3.9 View Styling
- [ ] Theme reset (`reset_theme()`)
- [ ] Custom style reset (`reset_custom_style()`)
- [ ] Node custom style reset (`reset_node_custom_style(node)`)
- [ ] Node overflow handling (`node_overflow: 'hidden'|'wrap'|'visible'`)

### 3.10 Graphics Rendering
- [ ] Graph system (Canvas and SVG implementation)
- [ ] Line drawing (straight/curved styles)
- [ ] Custom line rendering (`custom_line_render`)
- [ ] Line style configuration (line_width, line_color, line_style)
- [ ] Margin configuration (hmargin, vmargin)

## IV. Layout System (LayoutProvider)

### 4.1 Layout Initialization
- [ ] Complete LayoutProvider implementation
- [ ] Layout mode support (`mode: 'full'|'side'`)
- [ ] Layout parameter configuration (hspace, vspace, pspace, cousin_space)

### 4.2 Layout Calculation
- [ ] `layout()` - Execute layout calculation
- [ ] `layout_direction()` - Calculate node direction
- [ ] `layout_offset()` - Calculate node position offset
- [ ] `calculate_next_child_direction(node)` - Calculate next child node direction
- [ ] Boundary calculation (bounds)

### 4.3 Node Visibility
- [ ] `is_visible(node)` - Check if node is visible
- [ ] Node expand/collapse state management

### 4.4 Layout Reset
- [ ] `reset()` - Reset layout state

## V. Data System (DataProvider)

### 5.1 Data Loading
- [ ] Complete DataProvider implementation
- [ ] `load(mind_data)` - Load mind map data
- [ ] Support for multiple data formats:
  - [x] `node_tree` - Node tree format (JSON serializer already exists)
  - [ ] `node_array` - Node array format
  - [ ] `freemind` - FreeMind XML format (FreeMind serializer exists but needs integration)
  - [ ] `text` - Text format

### 5.2 Data Serialization
- [ ] `get_data(data_format)` - Get data in specified format
- [ ] Support serialization to multiple formats (node_tree, node_array, freemind, text)

### 5.3 Data Reset
- [ ] `reset()` - Reset data state

### 5.4 Metadata
- [ ] `get_meta()` - Get metadata (name, author, version)

## VI. Shortcut System (ShortcutProvider)

### 6.1 Shortcut Initialization
- [ ] Complete ShortcutProvider implementation
- [ ] Shortcut mapping configuration (`mapping`)
- [ ] Shortcut handler functions (`handles`)
- [ ] ID generator configuration (`id_generator`)

### 6.2 Shortcut Functions
- [ ] `addchild` - Add child node (Insert, Ctrl+Enter)
- [ ] `addbrother` - Add sibling node (Enter)
- [ ] `editnode` - Edit node (F2)
- [ ] `delnode` - Delete node (Delete)
- [ ] `toggle` - Toggle expand/collapse (Space)
- [ ] `up` - Navigate up (Up)
- [ ] `down` - Navigate down (Down)
- [ ] `left` - Navigate left (Left)
- [ ] `right` - Navigate right (Right)

### 6.3 Shortcut Control
- [ ] `enable_shortcut()` - Enable shortcuts
- [ ] `disable_shortcut()` - Disable shortcuts

## VII. Plugin System

### 7.1 Plugin Foundation
- [ ] Complete plugin system implementation (Plugin class)
- [ ] `register_plugin(plugin)` - Register plugin
- [ ] `apply_plugins(jm, options)` - Apply plugins

### 7.2 Built-in Plugins
- [ ] `draggable-node` - Draggable node plugin
  - [ ] Node dragging functionality
  - [ ] Visual feedback during dragging (shadow node)
  - [ ] Helper lines during dragging
  - [ ] Auto-scroll support
  - [ ] Target node lookup
- [ ] `screenshot` - Screenshot plugin
  - [ ] Mind map screenshot functionality
  - [ ] Watermark support
  - [ ] Background color configuration
  - [ ] Image download

## VIII. Utility Functions (util)

### 8.1 File Operations
- [ ] `util.file.read(file_data, callback)` - Read file
- [ ] `util.file.save(file_data, type, name)` - Save file

### 8.2 JSON Operations
- [ ] `util.json.json2string(json)` - Convert JSON to string
- [ ] `util.json.string2json(json_str)` - Convert string to JSON
- [ ] `util.json.merge(b, a)` - Merge JSON objects

### 8.3 UUID Generation
- [ ] `util.uuid.newid()` - Generate UUID

### 8.4 Text Operations
- [ ] `util.text.is_empty(s)` - Check if string is empty

## IX. DOM Utilities (jsmind.dom)

### 9.1 DOM Operations
- [ ] Complete DOM utility class ($)
- [ ] Basic functions: element creation, querying, event binding, etc.

## X. Event System

### 10.1 Event Listening
- [ ] `add_event_listener(callback)` - Add event listener
- [ ] `clear_event_listener()` - Clear event listeners
- [ ] `invoke_event_handle(type, data)` - Invoke event handling

### 10.2 Event Types
- [ ] `EventType.show` - Show event
- [ ] `EventType.resize` - Resize event
- [ ] `EventType.edit` - Edit event
- [ ] `EventType.select` - Select event

## XI. Data Format Support

### 11.1 node_array Format
- [ ] Serialization support
- [ ] Deserialization support

### 11.2 text Format
- [ ] Serialization support
- [ ] Deserialization support

### 11.3 freemind Format
- [x] Serializer exists (`JmMindFreeMindSerializer`)
- [ ] Integration into DataProvider
- [ ] Complete testing

## XII. Configuration Options

### 12.1 Runtime Options
- [ ] Complete option merging and validation
- [ ] Support for all configuration options:
  - [ ] `container` - Container
  - [ ] `editable` - Whether editable
  - [ ] `theme` - Theme
  - [ ] `mode` - Layout mode (full/side)
  - [ ] `support_html` - Support HTML
  - [ ] `log_level` - Log level
  - [ ] `view.*` - View configuration
  - [ ] `layout.*` - Layout configuration
  - [ ] `shortcut.*` - Shortcut configuration
  - [ ] `default_event_handle.*` - Default event handling configuration
  - [ ] `plugin.*` - Plugin configuration

## XIII. Async Rendering Support

### 13.1 Promise Support
- [ ] Node rendering using Promise (async mode)
- [ ] View update supports async
- [ ] Layout calculation supports async (if needed)

## XIV. Other Features

### 14.1 Static Methods
- [ ] `jsMind.current` - Get current instance
- [ ] `jsMind.show(options, mind)` - Static show method (deprecated but needs support)

### 14.2 Compatibility
- [ ] Compatibility mode when container is not visible (`run_in_c11y_mode_if_needed`)
- [ ] IntersectionObserver support

### 14.3 Expander Style
- [ ] Character style (`expander_style: 'char'`)
- [ ] Number style (`expander_style: 'number'`)

## Summary

jsmind-v2 has currently completed:
1. ✅ Core model system (JmMind, JmNode, JmEdge, JmNodeContent)
2. ✅ Event system (Observer, ObserverManager)
3. ✅ Serialization system (JSON, FreeMind)
4. ✅ ID generator
5. ✅ Basic view interface

**Main missing feature modules:**
1. ❌ Complete view system implementation (ViewProvider)
2. ❌ Layout system (LayoutProvider)
3. ❌ Data provider (DataProvider)
4. ❌ Shortcut system (ShortcutProvider)
5. ❌ Plugin system
6. ❌ Utility functions (util)
7. ❌ DOM utilities
8. ❌ Complete API implementation for main class (JsMind)
9. ❌ Async rendering support (Promise)

**Priority recommendations:**
1. **High priority**: View system, layout system, data provider (core features)
2. **Medium priority**: Main class API, shortcut system, utility functions
3. **Low priority**: Plugin system, advanced features
