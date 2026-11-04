# jsMind V2 Documentation

This directory contains all documentation for the jsMind V2 project.

## Directory Structure

```
docs/
├── README.md                    # This index document
├── requirements/               # Product requirements
│   └── v2-requirements.md      # jsmind-v2 requirements (scope, goals, decisions)
├── architecture/               # Architecture design documents
│   └── hybrid-edge-system.md   # Hybrid edge system design
├── features/                   # Feature documentation
│   ├── node-content.md         # Node content system
│   ├── node-move.md            # Node move functionality
│   └── serialization.md        # Serialization system
└── development/                # Development-related documents
    ├── roadmap.md              # Development plan (PR sequence, test strategy)
    ├── missing-features.md     # Missing features checklist
    └── tslib-explanation.md    # tslib library explanation
```

## Document Categories

### Requirements (requirements/)

Product-level scope and decisions: what v2 aims to be, what it explicitly will not do, and which approaches were rejected and why.

- **v2-requirements.md** - Requirements document (written in Chinese)

### Architecture (architecture/)
Contains system architecture and design decision documents.

- **hybrid-edge-system.md** - Design document for the hybrid edge system, explaining how to balance performance and extensibility for managing relationships in mind maps.

### Features (features/)
Contains detailed documentation for specific features.

- **node-content.md** - Design and usage guide for the node content system
- **node-move.md** - Implementation details for node move functionality
- **serialization.md** - Architecture and usage guide for the serialization system

### Development (development/)

- **roadmap.md** - Development plan: layered PR sequence, per-PR scope, and test strategy (written in Chinese)

### Other development docs
Contains development status, plans, and task-related documents.

- **missing-features.md** - Checklist of features missing in jsmind-v2 compared to the original jsmind

## Other Documents

- **tslib-explanation.md** (in development/) - Explanation of what tslib is and why it's needed
