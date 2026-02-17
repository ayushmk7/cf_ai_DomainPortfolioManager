# PRD: DomainPilot -- AI-Powered DNS & Domain Portfolio Manager

## Built on Cloudflare Agents SDK

---

## 1. Problem Statement

Developers, indie hackers, small agencies, and domain investors routinely manage 10-100+ domains across multiple registrars. They deal with:

- **Missed renewals** that cause domain loss (often irreversible and expensive to recover)
- **SSL certificate expirations** that silently break production sites
- **DNS misconfiguration** that takes hours to debug because they forgot what they changed and when
- **No unified view** across registrars (Cloudflare, Namecheap, GoDaddy, Porkbun, etc.)
- **No change history** for DNS records, making rollback or audit impossible
- **Manual tracking** of which domains are active, parked, expiring, or up for sale

There is no existing tool that combines domain lifecycle management with AI-powered natural language DNS configuration, historical tracking, and proactive alerting in a single chat interface.

---

## 2. Product Overview

**DomainPilot** is a chat-first AI agent built on Cloudflare's Agents SDK that acts as a personal domain operations assistant. Users interact with it via a real-time chat interface to manage their entire domain portfolio: add domains, configure DNS records using natural language, track expiry and SSL status, get proactive alerts, and search historical configuration changes.

### Core Value Proposition

Instead of logging into 3 different registrar dashboards, reading DNS documentation, and setting calendar reminders, the user talks to DomainPilot:

- "Add example.com, it expires Jan 15 2027, registrar is Namecheap"
- "Point blog.example.com to 203.0.113.50"
- "What DNS records does api.example.com have?"
- "Show me all domains expiring in the next 60 days"
- "When did I last change the MX records for example.com?"
- "Generate a report of all my domains and their health status"

---

## 3. Assignment Requirements Mapping

This section maps every assignment requirement to a specific feature in DomainPilot.

### 3.1 LLM (Llama 3.3 on Workers AI)

**Model:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

**Usage points:**

| Feature | How the LLM is used |
|---------|---------------------|
| Natural language DNS config | User says "point blog.example.com to my server at 203.0.113.50". LLM parses intent and extracts: subdomain=blog, domain=example.com, record_type=A, value=203.0.113.50. Returns structured JSON via tool calling. |
| Domain health analysis | LLM receives current DNS records, SSL status, and expiry data. Generates a plain-language health report explaining what is configured correctly and what needs attention. |
| Change history search | User asks "when did I change MX records for example.com". LLM converts this to a SQL query against the change history table and formats results into readable text. |
| Conversational Q&A | User asks DNS questions like "what's the difference between a CNAME and an ALIAS record" or "should I use a wildcard cert". LLM answers from its training knowledge. |
| Alert message generation | When a scheduled check detects an issue (expiring domain, expiring SSL), the LLM generates a clear, actionable notification explaining the issue and what to do. |
| Bulk operation planning | User says "migrate all my email from Google Workspace to Fastmail". LLM identifies which domains have Google MX records, generates the new MX record set for each, and presents the plan for approval. |

**Implementation detail:**

```typescript
// Using Vercel AI SDK with Workers AI provider
import { createWorkersAI } from "workers-ai-provider";
import { streamText, tool } from "ai";
import { z } from "zod";

const workersai = createWorkersAI({ binding: env.AI });

const result = streamText({
  model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
  system: DOMAIN_MANAGER_SYSTEM_PROMPT,
  messages: this.messages,
  tools: {
    addDomain: tool({
      description: "Add a new domain to the portfolio",
      parameters: z.object({
        domain: z.string(),
        registrar: z.string().optional(),
        expiryDate: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (params) => this.addDomain(params),
    }),
    addDnsRecord: tool({
      description: "Add or update a DNS record for a domain",
      parameters: z.object({
        domain: z.string(),
        subdomain: z.string().optional(),
        type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]),
        value: z.string(),
        ttl: z.number().optional(),
        priority: z.number().optional(),
      }),
      execute: async (params) => this.addDnsRecord(params),
    }),
    queryDomains: tool({
      description: "Search and filter domains in the portfolio",
      parameters: z.object({
        query: z.string().optional(),
        filter: z.enum(["all", "expiring_soon", "ssl_issues", "inactive"]).optional(),
      }),
      execute: async (params) => this.queryDomains(params),
    }),
    getDnsHistory: tool({
      description: "Get change history for a domain's DNS records",
      parameters: z.object({
        domain: z.string(),
        recordType: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async (params) => this.getDnsHistory(params),
    }),
    checkDomainHealth: tool({
      description: "Run health check on a domain",
      parameters: z.object({
        domain: z.string(),
      }),
      execute: async (params) => this.checkDomainHealth(params),
    }),
  },
});
```

### 3.2 Workflow / Coordination (Agents SDK + Durable Objects + Workflows)

**Three distinct workflow/coordination patterns are used:**

#### A. Agent Class (Durable Objects)

The `DomainPilotAgent` extends `AIChatAgent` from the Agents SDK. Each user gets their own agent instance (identified by user ID), which means:

- Each user's domain portfolio, DNS history, and preferences are isolated in their own Durable Object
- The agent persists across sessions (user closes browser, comes back, everything is still there)
- WebSocket connections allow real-time chat and state sync
- The agent hibernates when idle (no cost when inactive)

```typescript
import { AIChatAgent } from "agents/ai-chat-agent";

interface DomainPilotState {
  domainCount: number;
  lastHealthCheck: string | null;
  pendingApprovals: PendingAction[];
  alertsEnabled: boolean;
}

export class DomainPilotAgent extends AIChatAgent<Env, DomainPilotState> {
  initialState: DomainPilotState = {
    domainCount: 0,
    lastHealthCheck: null,
    pendingApprovals: [],
    alertsEnabled: true,
  };

  async onStart() {
    // Initialize database tables on first run
    this.ensureTablesExist();
    // Schedule recurring health checks
    this.schedule("0 8 * * *", "runDailyHealthCheck");
    // Schedule weekly portfolio digest
    this.schedule("0 9 * 1", "generateWeeklyDigest");
  }

  async onChatMessage(onFinish) {
    // LLM interaction with tool calling (see section 3.1)
  }
}
```

#### B. Scheduled Tasks (Scheduling API)

The Agent scheduling API runs recurring and one-off tasks:

| Schedule | Callback | Purpose |
|----------|----------|---------|
| `0 8 * * *` (daily 8am) | `runDailyHealthCheck` | Check all domains for expiry within 30/14/7/1 days, check SSL cert validity |
| `0 9 * * 1` (weekly Monday 9am) | `generateWeeklyDigest` | Generate a portfolio summary: domain count, upcoming expirations, recent changes |
| One-shot (user-triggered) | `sendRenewalReminder` | Scheduled when user adds a domain; fires X days before expiry |
| `0 */6 * * *` (every 6 hours) | `checkDnsPropagatation` | For recently changed records, verify propagation status |

```typescript
// Inside DomainPilotAgent class

async runDailyHealthCheck() {
  const domains = this.sql<DomainRecord>`SELECT * FROM domains WHERE active = 1`;

  for (const domain of domains) {
    const daysUntilExpiry = this.daysUntil(domain.expiry_date);

    if (daysUntilExpiry <= 7) {
      const alert = await this.generateAlert(domain, "critical_expiry", daysUntilExpiry);
      this.broadcastAlert(alert);
    } else if (daysUntilExpiry <= 30) {
      const alert = await this.generateAlert(domain, "upcoming_expiry", daysUntilExpiry);
      this.broadcastAlert(alert);
    }
  }

  this.setState({ ...this.state, lastHealthCheck: new Date().toISOString() });
}

async scheduleExpiryReminders(domain: string, expiryDate: Date) {
  // Schedule reminders at 30, 14, 7, and 1 day before expiry
  for (const daysBefore of [30, 14, 7, 1]) {
    const reminderDate = new Date(expiryDate.getTime() - daysBefore * 86400000);
    if (reminderDate > new Date()) {
      await this.schedule(reminderDate, "sendRenewalReminder", {
        domain,
        daysBefore,
      });
    }
  }
}
```

#### C. Workflows (for multi-step domain operations)

Cloudflare Workflows handle multi-step operations that need retry logic and durability:

**Workflow 1: Domain Onboarding**

When a user adds a new domain, a Workflow runs the full onboarding pipeline:

```
Step 1: Validate domain format
Step 2: Store domain in SQLite
Step 3: Schedule expiry reminders
Step 4: Generate initial health report using LLM
Step 5: Update agent state (domain count)
Step 6: Notify user via WebSocket
```

**Workflow 2: Bulk DNS Update**

When a user requests a bulk change (e.g., "update SPF records on all my domains"):

```
Step 1: LLM parses the intent, identifies affected domains
Step 2: Generate the record changes for each domain
Step 3: Present changes to user for approval (human-in-the-loop)
Step 4: On approval, apply changes one by one with error handling
Step 5: Log each change to history table
Step 6: Report results
```

```typescript
// wrangler.jsonc workflow binding
{
  "workflows": [
    {
      "name": "domain-onboarding",
      "binding": "DOMAIN_ONBOARDING_WORKFLOW",
      "class_name": "DomainOnboardingWorkflow"
    },
    {
      "name": "bulk-dns-update",
      "binding": "BULK_DNS_UPDATE_WORKFLOW",
      "class_name": "BulkDnsUpdateWorkflow"
    }
  ]
}
```

### 3.3 User Input via Chat (Pages + React + WebSocket)

**Frontend:** A React single-page application deployed on Cloudflare Pages.

**Connection:** Real-time WebSocket via the Agents SDK `useAgent` and `useAgentChat` hooks.

**UI Components:**

1. **Chat Panel (primary interaction)**: Full conversation history with the agent. Supports text input, displays streamed LLM responses, shows tool call results inline (DNS records rendered as tables, domain lists as cards).

2. **Domain Dashboard (state-synced sidebar)**: A live-updating sidebar showing:
   - Total domains managed
   - Domains expiring soon (color-coded: red <7 days, yellow <30 days)
   - Recent DNS changes
   - Pending approvals (human-in-the-loop items)
   - Last health check timestamp

3. **Approval Panel**: When the agent proposes a change (DNS update, bulk operation), it appears as an approval card with "Approve" / "Reject" buttons. This is the human-in-the-loop interface.

```tsx
// App.tsx - Client-side React application
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";

function DomainPilot() {
  const agent = useAgent<DomainPilotAgent, DomainPilotState>({
    agent: "domain-pilot-agent",
    name: getUserId(), // Each user gets their own agent instance
    onStateUpdate: (state) => {
      setDashboardState(state);
    },
  });

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    status,
    addToolResult,
  } = useAgentChat({
    agent,
  });

  return (
    <div className="app-layout">
      <Sidebar state={dashboardState} />
      <ChatPanel
        messages={messages}
        input={input}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onApprove={(actionId) => handleApproval(actionId, true)}
        onReject={(actionId) => handleApproval(actionId, false)}
      />
    </div>
  );
}
```

### 3.4 Memory / State

DomainPilot uses three layers of persistent state:

#### Layer 1: Agent State (Real-time synced via `setState`)

Used for live dashboard data that needs to sync instantly between server and client:

```typescript
interface DomainPilotState {
  domainCount: number;
  domainsExpiringSoon: number;
  lastHealthCheck: string | null;
  pendingApprovals: PendingAction[];
  recentChanges: ChangeLogEntry[];
  alertsEnabled: boolean;
}
```

This state is automatically synced to all connected clients via WebSocket when `this.setState()` is called server-side.

#### Layer 2: SQL Database (Durable Objects SQLite via `this.sql`)

Persistent structured data stored in the agent's embedded SQLite database:

**Table: `domains`**
```sql
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  registrar TEXT,
  expiry_date TEXT,
  ssl_expiry_date TEXT,
  status TEXT DEFAULT 'active',  -- active, parked, for_sale, expired
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notes TEXT
);
```

**Table: `dns_records`**
```sql
CREATE TABLE IF NOT EXISTS dns_records (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  subdomain TEXT DEFAULT '',
  record_type TEXT NOT NULL,  -- A, AAAA, CNAME, MX, TXT, NS, SRV, CAA
  value TEXT NOT NULL,
  ttl INTEGER DEFAULT 3600,
  priority INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Table: `dns_change_history`**
```sql
CREATE TABLE IF NOT EXISTS dns_change_history (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  record_id TEXT,
  action TEXT NOT NULL,  -- created, updated, deleted
  record_type TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT NOT NULL,
  change_source TEXT DEFAULT 'user'  -- user, bulk_update, import
);
```

**Table: `scheduled_alerts`**
```sql
CREATE TABLE IF NOT EXISTS scheduled_alerts (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  alert_type TEXT NOT NULL,  -- expiry_reminder, ssl_warning, health_check
  scheduled_for TEXT NOT NULL,
  sent INTEGER DEFAULT 0,
  message TEXT
);
```

#### Layer 3: Vectorize (Semantic Search over DNS History)

Used for natural language queries over change history and domain notes.

**Index:** `domain-history-index` (768 dimensions, cosine similarity)

**Embedding model:** `@cf/baai/bge-base-en-v1.5`

When a DNS change is made or a domain note is updated, the change description is embedded and stored in Vectorize:

```typescript
async indexChangeForSearch(change: ChangeLogEntry, domain: string) {
  const description = `${change.action} ${change.record_type} record for ${domain}: ` +
    `old value was ${change.old_value}, new value is ${change.new_value}`;

  const embedding = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: [description],
  });

  await this.env.VECTORIZE.upsert([{
    id: change.id,
    values: embedding.data[0],
    metadata: {
      domain,
      record_type: change.record_type,
      action: change.action,
      changed_at: change.changed_at,
      description,
    },
  }]);
}
```

This enables queries like:
- "When did I change MX records for example.com?" -> semantic search finds relevant history entries
- "Show me all changes I made related to email configuration" -> finds MX, SPF (TXT), DKIM (TXT) changes across all domains
- "What did I change last Tuesday?" -> temporal + semantic search

### 3.5 Human-in-the-Loop

The agent uses human-in-the-loop for any destructive or sensitive operation:

| Operation | Requires Approval |
|-----------|------------------|
| Add a single DNS record | No (low risk, easily reversible) |
| Delete a DNS record | Yes |
| Bulk update DNS records across multiple domains | Yes |
| Mark domain as expired/inactive | Yes |
| Delete a domain from portfolio | Yes |
| Change domain registrar info | No |

**Implementation:**

When the agent determines an action needs approval, it:
1. Adds the action to `pendingApprovals` in agent state
2. Sends a structured message to the chat with the proposed action details
3. The React client renders an approval card with Approve/Reject buttons
4. User clicks Approve or Reject
5. The decision is sent back via the `addToolResult` mechanism
6. Agent proceeds or cancels accordingly

```typescript
// Server-side: requesting approval
async requestApproval(action: ProposedAction): Promise<boolean> {
  const approval: PendingAction = {
    id: crypto.randomUUID(),
    action: action.type,
    description: action.description,
    details: action.details,
    createdAt: new Date().toISOString(),
  };

  this.setState({
    ...this.state,
    pendingApprovals: [...this.state.pendingApprovals, approval],
  });

  // The chat message with the approval request is sent as part of
  // the LLM's tool call response
  return new Promise((resolve) => {
    this.approvalCallbacks.set(approval.id, resolve);
  });
}

// Called when user clicks Approve/Reject in the UI
async handleApprovalResponse(approvalId: string, approved: boolean) {
  const callback = this.approvalCallbacks.get(approvalId);
  if (callback) {
    callback(approved);
    this.approvalCallbacks.delete(approvalId);
  }

  this.setState({
    ...this.state,
    pendingApprovals: this.state.pendingApprovals.filter(a => a.id !== approvalId),
  });
}
```

---

## 4. System Architecture

```
+--------------------------------------------------+
|              Cloudflare Pages (React SPA)          |
|                                                    |
|  +-------------+  +---------------------------+   |
|  |  Chat Panel |  |  Domain Dashboard (live)  |   |
|  |  (useAgent  |  |  - Domain count           |   |
|  |   Chat)     |  |  - Expiring soon          |   |
|  |             |  |  - Recent changes         |   |
|  +------+------+  |  - Pending approvals      |   |
|         |         +-------------+-------------+   |
+---------+--------------------------+--------------+
          |  WebSocket               |  State Sync
          |  (chat messages)         |  (automatic)
          v                          v
+--------------------------------------------------+
|         DomainPilotAgent (Durable Object)         |
|         One instance per user                     |
|                                                    |
|  +------------------+  +---------------------+    |
|  | AIChatAgent      |  | Scheduling API      |    |
|  | - onChatMessage  |  | - Daily health check|    |
|  | - tool calling   |  | - Expiry reminders  |    |
|  | - saveMessages   |  | - Weekly digest     |    |
|  +--------+---------+  +----------+----------+    |
|           |                       |                |
|  +--------v---------+  +---------v-----------+    |
|  | SQLite Database   |  | Agent State         |    |
|  | - domains         |  | - domainCount       |    |
|  | - dns_records     |  | - pendingApprovals  |    |
|  | - change_history  |  | - recentChanges     |    |
|  | - alerts          |  | (synced to client)  |    |
|  +-------------------+  +---------------------+    |
+-----+----------------------------+----------------+
      |                            |
      v                            v
+---------------+        +------------------+
| Workers AI    |        | Vectorize        |
| - Llama 3.3  |        | - DNS history    |
|   70B fp8    |        |   embeddings     |
| - BGE base   |        | - Semantic search|
|   (embeddings)|        +------------------+
+---------------+
      |
      v
+------------------+
| Workflows        |
| - Domain onboard |
| - Bulk DNS update|
+------------------+
```

---

## 5. Data Models

### 5.1 Domain Record

```typescript
interface DomainRecord {
  id: string;                    // UUID
  domain: string;                // "example.com"
  registrar: string | null;      // "Namecheap", "Cloudflare", "GoDaddy"
  expiry_date: string | null;    // ISO 8601 date
  ssl_expiry_date: string | null;// ISO 8601 date
  status: "active" | "parked" | "for_sale" | "expired";
  created_at: string;            // ISO 8601 datetime
  updated_at: string;            // ISO 8601 datetime
  notes: string | null;          // Freeform text
}
```

### 5.2 DNS Record

```typescript
interface DnsRecord {
  id: string;
  domain_id: string;
  subdomain: string;             // "" for root, "www", "blog", etc.
  record_type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV" | "CAA";
  value: string;                 // IP, hostname, or TXT value
  ttl: number;                   // Seconds, default 3600
  priority: number | null;       // For MX and SRV records
  created_at: string;
  updated_at: string;
}
```

### 5.3 Change History Entry

```typescript
interface ChangeLogEntry {
  id: string;
  domain_id: string;
  record_id: string | null;
  action: "created" | "updated" | "deleted";
  record_type: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  change_source: "user" | "bulk_update" | "import";
}
```

### 5.4 Pending Approval

```typescript
interface PendingAction {
  id: string;
  action: string;                // "delete_record", "bulk_update", etc.
  description: string;           // Human-readable description
  details: Record<string, any>;  // Action-specific payload
  createdAt: string;
}
```

---

## 6. LLM Tool Definitions

The agent exposes the following tools to the LLM via the Vercel AI SDK `tool()` function:

### 6.1 `addDomain`

Adds a new domain to the portfolio.

**Parameters:**
- `domain` (string, required): The domain name
- `registrar` (string, optional): Registrar name
- `expiryDate` (string, optional): Expiry date in any parseable format
- `notes` (string, optional): Any notes about the domain

**Behavior:** Validates domain format, inserts into SQLite, schedules expiry reminders if date provided, triggers onboarding workflow, updates agent state.

### 6.2 `addDnsRecord`

Adds or updates a DNS record.

**Parameters:**
- `domain` (string, required): The domain name
- `subdomain` (string, optional): Subdomain prefix
- `type` (enum, required): Record type
- `value` (string, required): Record value
- `ttl` (number, optional): TTL in seconds
- `priority` (number, optional): Priority for MX/SRV

**Behavior:** Validates record, upserts into SQLite, logs change to history, indexes change in Vectorize.

### 6.3 `deleteDnsRecord`

Deletes a DNS record. Requires human-in-the-loop approval.

**Parameters:**
- `domain` (string, required)
- `subdomain` (string, optional)
- `type` (enum, required)

**Behavior:** Finds matching record, presents deletion to user for approval, on approval deletes and logs to history.

### 6.4 `queryDomains`

Searches and filters the domain portfolio.

**Parameters:**
- `query` (string, optional): Search term
- `filter` (enum, optional): "all", "expiring_soon", "ssl_issues", "inactive"
- `registrar` (string, optional): Filter by registrar

**Behavior:** Runs SQL query with appropriate WHERE clauses, returns formatted results.

### 6.5 `getDnsRecords`

Gets all DNS records for a specific domain.

**Parameters:**
- `domain` (string, required)
- `recordType` (string, optional): Filter by type

**Behavior:** SQL SELECT on dns_records table.

### 6.6 `getDnsHistory`

Gets change history for a domain.

**Parameters:**
- `domain` (string, required)
- `recordType` (string, optional): Filter by record type
- `limit` (number, optional): Max results

**Behavior:** SQL query on dns_change_history, optionally combined with Vectorize semantic search for natural language queries.

### 6.7 `searchHistory`

Semantic search across all change history using Vectorize.

**Parameters:**
- `query` (string, required): Natural language query

**Behavior:** Embeds query using BGE model, queries Vectorize, returns matching history entries with metadata.

### 6.8 `checkDomainHealth`

Runs a health check on a single domain.

**Parameters:**
- `domain` (string, required)

**Behavior:** Checks expiry date proximity, SSL expiry, whether required records exist (A/AAAA for root, MX for email, SPF/DKIM TXT records). Returns structured health report.

### 6.9 `bulkUpdate`

Proposes a bulk DNS change across multiple domains. Always triggers human-in-the-loop.

**Parameters:**
- `description` (string, required): What the user wants to change
- `domains` (string[], optional): Specific domains, or all if omitted

**Behavior:** LLM generates the change plan, presents for approval, on approval triggers BulkDnsUpdateWorkflow.

---

## 7. Cloudflare Services Used

| Service | Purpose | Binding Name |
|---------|---------|--------------|
| Workers AI | LLM inference (Llama 3.3 70B) and text embeddings (BGE base) | `AI` |
| Durable Objects | Agent instance per user, SQLite storage, WebSocket, scheduling | `DOMAIN_PILOT_AGENT` |
| Agents SDK | Agent class, state sync, chat, scheduling API | (npm package) |
| Vectorize | Semantic search over DNS change history | `VECTORIZE` |
| Pages | React frontend hosting | (deployment target) |
| Workflows | Multi-step domain onboarding and bulk DNS updates | `DOMAIN_ONBOARDING_WORKFLOW`, `BULK_DNS_UPDATE_WORKFLOW` |
| AI Gateway | (optional) Caching, rate limiting, logging for AI requests | `AI_GATEWAY` |

---

## 8. Wrangler Configuration

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "domain-pilot",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",

  // AI binding for Workers AI models
  "ai": {
    "binding": "AI"
  },

  // Durable Objects for the Agent
  "durable_objects": {
    "bindings": [
      {
        "name": "DOMAIN_PILOT_AGENT",
        "class_name": "DomainPilotAgent"
      }
    ]
  },

  // SQLite storage for agent instances
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["DomainPilotAgent"]
    }
  ],

  // Vectorize for semantic search
  "vectorize": [
    {
      "binding": "VECTORIZE",
      "index_name": "domain-history-index"
    }
  ],

  // Workflows
  "workflows": [
    {
      "name": "domain-onboarding",
      "binding": "DOMAIN_ONBOARDING_WORKFLOW",
      "class_name": "DomainOnboardingWorkflow"
    },
    {
      "name": "bulk-dns-update",
      "binding": "BULK_DNS_UPDATE_WORKFLOW",
      "class_name": "BulkDnsUpdateWorkflow"
    }
  ]
}
```

---

## 9. Project Structure

```
domain-pilot/
├── src/
│   ├── index.ts                    # Worker entry point, routes requests
│   ├── agent/
│   │   ├── DomainPilotAgent.ts     # Main agent class (extends AIChatAgent)
│   │   ├── tools.ts                # Tool definitions for LLM
│   │   ├── prompts.ts              # System prompts for the LLM
│   │   └── db.ts                   # Database schema initialization and queries
│   ├── workflows/
│   │   ├── DomainOnboardingWorkflow.ts
│   │   └── BulkDnsUpdateWorkflow.ts
│   └── utils/
│       ├── dns-validator.ts        # DNS record validation logic
│       ├── domain-validator.ts     # Domain name validation
│       └── date-utils.ts           # Expiry date parsing and diff calculations
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Main React app
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx       # Chat interface using useAgentChat
│   │   │   ├── Sidebar.tsx         # Domain dashboard sidebar
│   │   │   ├── ApprovalCard.tsx    # Human-in-the-loop approval UI
│   │   │   ├── DomainCard.tsx      # Domain summary card
│   │   │   ├── DnsRecordTable.tsx  # DNS records table display
│   │   │   └── HealthBadge.tsx     # Domain health status indicator
│   │   └── hooks/
│   │       └── useDomainPilot.ts   # Custom hook wrapping useAgent + useAgentChat
│   ├── package.json
│   └── vite.config.ts
├── wrangler.jsonc
├── package.json
├── tsconfig.json
└── README.md
```

---

## 10. User Flows

### Flow 1: First Time Setup

```
User opens app -> connects to their agent instance (created on first visit)
Agent onStart() runs -> creates database tables, schedules recurring checks
Agent sends welcome message:
  "Welcome to DomainPilot. I can help you manage your domain portfolio.
   Start by telling me about your domains. For example:
   'Add example.com, expires March 2026, registered on Namecheap'"
User adds their first domain via chat
Agent stores it, schedules reminders, confirms
Dashboard sidebar updates in real-time showing domain count = 1
```

### Flow 2: Natural Language DNS Configuration

```
User: "Set up email for example.com using Google Workspace"
Agent (LLM): Identifies this requires MX records for Google Workspace
  -> Calls addDnsRecord tool 4 times:
     MX 1 ASPMX.L.GOOGLE.COM
     MX 5 ALT1.ASPMX.L.GOOGLE.COM
     MX 5 ALT2.ASPMX.L.GOOGLE.COM
     MX 10 ALT3.ASPMX.L.GOOGLE.COM
  -> Also suggests SPF TXT record: "v=spf1 include:_spf.google.com ~all"
Agent: "I've added 4 MX records and an SPF record for Google Workspace
        on example.com. Here's what I configured: [table of records]"
Dashboard updates with recent changes
```

### Flow 3: Bulk Operation with Approval

```
User: "Update the SPF record on all my domains to include Mailgun"
Agent (LLM): Queries all domains with existing SPF records
  -> Generates a change plan:
     - example.com: "v=spf1 include:_spf.google.com ~all"
       becomes "v=spf1 include:_spf.google.com include:mailgun.org ~all"
     - mysite.io: "v=spf1 include:mailgun.org ~all" (already has it, skip)
     - another.dev: no SPF record, create new one
Agent: "I've prepared SPF updates for 2 domains. Please review:"
  -> Approval card appears in chat
User: clicks "Approve"
Agent: triggers BulkDnsUpdateWorkflow
  -> Updates records one by one
  -> Logs all changes to history
  -> Indexes changes in Vectorize
Agent: "Done. Updated SPF records on example.com and another.dev.
        mysite.io was skipped (already includes Mailgun)."
```

### Flow 4: History Search

```
User: "When did I change the nameservers for mysite.io?"
Agent (LLM): Calls searchHistory tool with the query
  -> Vectorize returns matching history entries
  -> SQL query fetches full details
Agent: "You changed the NS records for mysite.io on December 3, 2025.
        Old values: ns1.namecheap.com, ns2.namecheap.com
        New values: ada.ns.cloudflare.com, bert.ns.cloudflare.com
        Change source: user (via chat)"
```

### Flow 5: Proactive Alert (Scheduled)

```
Daily health check runs at 8:00 AM
Agent finds: example.com expires in 6 days
Agent generates alert using LLM:
  "Your domain example.com expires in 6 days (February 23, 2026).
   Registrar: Namecheap. If you haven't set up auto-renewal,
   you should renew it now to avoid losing it."
Alert is stored and sent to connected clients via WebSocket
If user is not connected, alert is queued and delivered on next connection
Dashboard sidebar shows red indicator for expiring domain
```

---

## 11. System Prompt

```typescript
const DOMAIN_MANAGER_SYSTEM_PROMPT = `You are DomainPilot, an AI assistant for managing domain names and DNS records.

You help users:
- Track their domain portfolio (registrars, expiry dates, status)
- Configure DNS records using natural language
- Search their DNS change history
- Understand domain health and configuration issues

When the user asks you to configure DNS records:
1. Identify the exact record type, subdomain, and value needed
2. Use the appropriate tool to make the change
3. Confirm what you did in plain language

When the user describes a service they want to set up (like "set up email with Google Workspace" or "point to Vercel"), you should know the standard DNS records required and configure them all.

For destructive operations (deleting records, bulk updates), always present the proposed changes and wait for explicit approval before proceeding.

When answering DNS questions, be precise and technical but explain things clearly. If you are unsure about a specific record value, ask the user rather than guessing.

You have access to the user's full domain portfolio and DNS history via your tools. Use them to give informed, contextual answers.`;
```

---

## 12. Deployment Steps

```bash
# 1. Create the project from the agents starter
npm create cloudflare@latest domain-pilot -- --template=cloudflare/agents-starter

# 2. Install dependencies
npm install ai @ai-sdk/openai workers-ai-provider zod

# 3. Create the Vectorize index
npx wrangler vectorize create domain-history-index \
  --dimensions=768 \
  --metric=cosine

# 4. Deploy
npx wrangler@latest deploy

# 5. Deploy frontend to Pages
cd frontend && npm run build
npx wrangler pages deploy dist --project-name=domain-pilot
```

---

## 13. Demo Script (for Reviewer)

This is the recommended sequence to demonstrate all features in under 5 minutes:

1. **Open the app** -> Show the clean chat interface and empty dashboard
2. **Add 3 domains via chat:**
   - "Add example.com, expires March 15 2026, Namecheap"
   - "Add myapp.io, expires June 1 2026, Cloudflare"
   - "Add testsite.dev, expires February 25 2026, Porkbun" (expires soon -- will trigger alert)
3. **Show dashboard updating** in real-time as domains are added
4. **Configure DNS via natural language:**
   - "Set up Google Workspace email for example.com"
   - Show the MX and SPF records being created
5. **Query DNS records:** "What records does example.com have?"
6. **Make a change:** "Update the A record for myapp.io to 198.51.100.1"
7. **Search history:** "What changes did I make to example.com today?"
8. **Bulk operation (human-in-the-loop):**
   - "Add a CAA record to all my domains allowing only letsencrypt.org"
   - Show the approval card, click Approve
9. **Health check:** "Check the health of all my domains"
   - Shows testsite.dev expiring in 8 days with a warning
10. **Demonstrate persistence:** Refresh the page, show everything is still there

---

## 14. Features Summary vs Assignment Checklist

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| **LLM** | Llama 3.3 70B (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) via Workers AI, with tool calling for DNS operations | Covered |
| **Workflow / Coordination** | Agents SDK (Durable Objects) for per-user agent instances + Cloudflare Workflows for multi-step operations + Scheduling API for recurring health checks and alerts | Covered |
| **User input via chat** | React SPA on Cloudflare Pages with `useAgentChat` hook, real-time WebSocket connection | Covered |
| **Memory or state** | Three layers: Agent state (real-time sync), SQLite (structured data), Vectorize (semantic search) | Covered |

**Bonus features demonstrated:**
- Human-in-the-loop (approval UI for destructive operations)
- Tool calling / function calling with the LLM
- Scheduled tasks (cron-based health checks and reminders)
- Semantic search via Vectorize embeddings
- Real-time state synchronization between server and client
- Resumable streaming (built into AIChatAgent)

---

## 15. Why This Project Stands Out

1. **Cloudflare-native problem.** Domain and DNS management is core to what Cloudflare does. A reviewer will immediately see the relevance and that the builder understands the platform.

2. **Every SDK feature has a natural role.** Nothing is forced. Scheduling exists because domains have expiry dates. State sync exists because you need a live dashboard. Vectorize exists because you need to search change history with natural language. Workflows exist because bulk DNS updates are multi-step operations that need durability.

3. **Demonstrably useful.** This is not a toy demo. Anyone who manages more than 5 domains would actually want to use this.

4. **Clean architecture.** One agent per user, SQLite for structured data, Vectorize for semantic search, Workflows for complex operations. The separation of concerns maps directly to Cloudflare's product boundaries.

5. **Shows depth.** Tool calling, human-in-the-loop, scheduled tasks, semantic search, real-time state sync, and streaming are all present and integrated. This demonstrates serious familiarity with the Agents SDK surface area.
