graph TD
    A[User Message] --> B{Extract Legal Number?}
    B -->|Yes| C[Find Property by Legal Number]
    B -->|No| D{PDF Request?}
    C --> E[Display Property Details]
    D -->|Yes| F[Extract Property from Context]
    D -->|No| G[Process with AI]
    F --> H{Property Found?}
    H -->|Yes| I[Generate PDF]
    H -->|No| J[Ask for Clarification]
    G --> K{AI Response Type}
    K -->|Search| L[Execute Search]
    K -->|Event| M[Handle Event]
    K -->|Answer| N[Send Response]
    L --> O[Format Results]
    M --> P[Process Event]
    O --> Q[Send Response]
    P --> Q
    N --> Q
    E --> Q
    I --> Q
    J --> Q
    Q --> R[Update Conversation State]
    R --> S[Send to WhatsApp]