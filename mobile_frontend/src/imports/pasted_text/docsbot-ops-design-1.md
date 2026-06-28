We are designing a web app called DocsBot Ops.

The app has two main modules:

1. Tender Hub
A document intelligence workspace connected to a Telegram bot. The bot receives tender documents from Telegram groups, stores them in structured folders, generates Obsidian-compatible notes, and lets users browse tender files.

2. ERP-TAKIP
A lightweight internal ERP/task tracking system for a company. Admins assign tasks to employees, attach documents, approve task completion, monitor online/offline status, receive help messages, and track overdue work.

Design goal:
Create a polished, production-ready SaaS dashboard UI. The design should feel professional, operational, dense but readable, not like a marketing landing page. Avoid decorative hero sections. Focus on workflow, clarity, speed, and admin control.

General design style:
- Clean enterprise dashboard
- Left sidebar navigation
- Top bar with global search, active company branch, notification bell, user profile menu
- Light theme first, optional dark mode variant
- Compact cards, tables, drawers, modals
- Use restrained colors: white, off-white, dark navy/charcoal text, teal or blue primary actions, red/orange only for warnings
- 8px max border radius
- Avoid oversized cards and empty whitespace
- Use icons for navigation and actions
- Use clear status badges: Online, Away, Offline, Pending approval, In progress, Done, Overdue, Cancelled
- Responsive desktop-first layout, but adaptable to tablet/mobile later

Main navigation structure:

A. Home
Purpose:
Module selection screen.

Content:
- Two main module entry cards:
  - ERP-TAKIP
  - Tender Hub
- Quick stats:
  - Active tasks
  - Pending approvals
  - Tender documents received today
  - Overdue tasks
- Recent activity feed
- System status: Telegram bot online/offline, database status, vault sync status

B. ERP-TAKIP Module

Pages needed:

1. ERP Overview
Purpose:
Admin dashboard summary.

Content:
- KPI cards:
  - Registered users
  - Online employees
  - Active tasks
  - Pending completion approvals
  - Overdue tasks
  - Help messages
- Recent tasks list
- Recent employees list
- Pending completion approvals preview
- Recent help messages preview
- Overdue employees preview
- Quick actions:
  - Assign new task
  - Add employee
  - Open messages
  - View approvals

Admin view:
Shows company-wide data.

Employee view:
Shows only the employee’s own profile, assigned tasks, messages, and notifications.

2. People / Employees
Admin-only page.

Purpose:
Manage employees and view profiles.

Content:
- Employee table/list with:
  - Name
  - Role
  - Department
  - Email
  - Phone
  - Online/Away/Offline status
  - Last seen
  - Active tasks
  - Completed tasks
  - Overdue tasks
- Search and filters:
  - Name
  - Department
  - Status
  - Role
- Employee profile detail panel:
  - Contact info
  - Role/department
  - Current status
  - Assigned tasks
  - Completion rate
  - Overdue history
  - Recent activity
- Admin actions:
  - Approve account request
  - Delete account
  - Assign task
  - Send message
  - View documents shared with this employee

3. Profile
Employee page.

Purpose:
Employee sees own information.

Content:
- Personal profile card
- Online/offline/away status
- Assigned tasks summary
- Completed tasks summary
- Overdue tasks summary
- Recent notifications
- Documents shared with this employee

4. Task Cards
Purpose:
Task tracking and assignment.

Admin view:
- Task board/table with filters:
  - Search by task title
  - Filter by status: Todo, In progress, Completion requested, Done, Overdue, Cancelled
  - Filter by assignee
  - Filter by due date
  - Filter by group/personal task
- Task cards include:
  - Title
  - Description
  - Assignee
  - Group or personal
  - Due date
  - Status badge
  - Attached document count
  - Created by
- Admin actions:
  - Create task
  - Cancel task
  - Edit task
  - Attach document from Tender Hub
  - Approve completion request
  - Reject completion request with note

Employee view:
- Only own tasks
- Task statuses:
  - Todo
  - In progress
  - Completion requested
  - Done
  - Overdue
- Employee actions:
  - Start task
  - Request completion approval
  - Send help message
  - View attached documents

Important workflow:
Employees cannot directly mark a task as Done.
They click “Request completion”.
The task becomes “Completion requested”.
Admin reviews and approves.
Only after admin approval, task becomes Done.

5. Completion Approvals
Admin page or section.

Purpose:
Review tasks employees claim to have completed.

Content:
- List of pending completion requests
- Each request shows:
  - Task title
  - Employee
  - Due date
  - Submitted time
  - Attached files/comments
- Detail drawer:
  - Full task description
  - Employee note
  - Attachments
  - Activity log
- Actions:
  - Approve completion
  - Reject and return to employee
  - Message employee

6. Help and Messages
Purpose:
Internal messaging between employees and admin.

Admin view:
- Inbox of employee messages
- Thread list by employee/task
- Message detail view
- Send reply
- Attach tender document to message
- Mark as resolved
- Notification badge for unread messages

Employee view:
- Conversation with admin
- Send help request
- Select related task
- View admin replies
- Notification badge for unread admin messages

7. Notifications
Purpose:
System notifications.

Content:
- Notification dropdown and full page
- Notification types:
  - New task assigned
  - Task deadline approaching
  - Task overdue
  - Admin sent message
  - Completion approved
  - Completion rejected
  - Account approved
- Actions:
  - Mark as read
  - Go to related task/message/profile

8. Account Requests
Admin page or modal.

Purpose:
Approve employee registration requests.

Content:
- Pending account requests
- Request details:
  - Name
  - Email
  - Phone
  - Department
  - Requested role
  - Created at
- Actions:
  - Approve
  - Reject
  - Assign department
  - Assign role

C. Tender Hub Module

Pages needed:

1. Tender Dashboard
Purpose:
Overview of tender document ingestion.

Content:
- KPI cards:
  - Total tenders
  - Documents received
  - Documents received today
  - Unclassified documents
  - Telegram groups connected
  - Obsidian notes generated
- Recent tender groups
- Recent uploaded documents
- Classification warnings
- Quick actions:
  - Open folder tree
  - Upload document
  - Open Obsidian demo
  - View Telegram groups

2. Telegram Groups
Purpose:
Manage Telegram tender groups.

Content:
- List of groups
- Group details:
  - Group name
  - Company branch
  - Tender company
  - Created date
  - Document count
  - Last document received
  - Bot status
- Actions:
  - Select company branch
  - Select tender company
  - Add new tender company
  - Search tender company
  - View received documents
  - Open group context
- Important group setup flow:
  - First choose internal company branch:
    - Mobit
    - Stok Enerji
    - Depart
    - Area
    - Mobiser
  - Then choose tender company from searchable paginated list
  - Tender company list may contain 500+ companies
  - Include search, pagination, and “Add new company”

3. Documents
Purpose:
Browse all ingested files.

Content:
- File table:
  - File name
  - Tender company
  - Internal branch
  - Tender ID
  - Upload date
  - File type
  - Size
  - Source group
  - Classification status
- Filters:
  - Year
  - Month
  - Internal branch
  - Tender company
  - File type
  - Source group
  - Classification status
- Actions:
  - Preview document
  - Download
  - Attach to ERP task
  - Open in Obsidian demo
  - Reclassify

4. Folder Tree
Purpose:
Display local storage structure.

Folder structure example:
data/originals/{year}/{internal_branch}/{tender_company}/{tender_id}/{file}

Example:
data/originals/2026/MOBIT/BEDAS/BEDAS-2026-20260609-001/document.pdf

Content:
- Explorer-style folder tree
- Breadcrumbs
- File preview panel
- Download action
- Upload action
- Search inside folders
- Metadata panel

5. Upload
Purpose:
Manual document upload.

Content:
- Drag and drop area
- Select internal branch
- Select tender company
- Select tender group/tender ID
- Optional notes
- Upload progress
- Classification preview
- Save action

6. Obsidian Demo
Purpose:
A web-based Obsidian-like viewer for tender knowledge.

This is very important.

Design this page visually inspired by Obsidian, but still part of our app.

Layout:
- Left sidebar:
  - Vault tree
  - Tenders grouped by year
  - Internal branch
  - Tender company
  - Tender ID
  - Documents
- Center editor/reader:
  - Markdown note preview
  - YAML frontmatter preview
  - Tender summary
  - Document list
  - Linked notes
  - Human notes area
- Right sidebar:
  - Graph/backlinks panel
  - Metadata panel
  - Related tenders
  - Similar documents
  - Extracted fields
  - AI suggestions placeholder
- Bottom or floating controls:
  - Open document
  - Download file
  - Attach to ERP task
  - Compare tenders
  - Generate summary

Visual features:
- Obsidian-like file explorer
- Markdown note cards
- Internal wiki links like [[BEDAS-2026-20260609-001]]
- Backlinks section
- Tag chips
- Graph visualization placeholder
- Document preview drawer
- Search command palette style input

Obsidian Demo should show:
- Tender note
- Document notes
- Links between tender, documents, companies, years, and ERP tasks
- A graph panel showing relationships:
  - Company branch -> Tender company -> Tender -> Documents -> ERP tasks

7. Tender Detail
Purpose:
Single tender workspace.

Content:
- Tender title
- Internal branch
- Tender company
- Tender ID
- Date
- Document list
- Notes
- Related ERP tasks
- Cost fields if extracted
- Missing information warnings
- Activity timeline
- Actions:
  - Attach documents to task
  - Open Obsidian demo
  - Download all
  - Compare with another tender

8. AI / Extraction Placeholder
Future page, not fully functional yet.

Purpose:
Show planned AI features.

Content:
- Extracted fields:
  - Tender price
  - Dates
  - Quantity items
  - Technical requirements
  - Guarantees
  - Company names
- Confidence score
- Missing field warnings
- Manual correction UI
- Compare two tenders
- Generate summary report
- Ask question about tender documents

Important:
Do not make this look like a chatbot-only page. It should look like a structured document intelligence workspace.

D. Cross-module workflows

1. Attach Tender Document to ERP Task
Design a modal:
- Search tender documents
- Filter by tender company/year
- Select one or more documents
- Attach to task
- Show who can view the document

2. Create Task From Tender Document
Design flow:
- Open document
- Click “Create ERP task”
- Select employee or group
- Add title/description/deadline
- Attach current document automatically
- Send notification to employee

3. Notification Center
Works across ERP and Tender Hub.

4. Global Search
Search across:
- Employees
- Tasks
- Tender companies
- Tender documents
- Telegram groups
- Obsidian notes

Suggested pages to design as frames:
- Home
- ERP Overview - Admin
- ERP Overview - Employee
- Employees / People - Admin
- Profile - Employee
- Task Cards - Admin
- Task Cards - Employee
- Completion Approvals - Admin
- Help & Messages - Admin
- Help & Messages - Employee
- Notifications
- Account Requests - Admin
- Tender Dashboard
- Telegram Groups
- Documents
- Folder Tree
- Upload
- Obsidian Demo
- Tender Detail
- AI Extraction Placeholder
- Attach Tender Document Modal
- Create Task Modal
- Login
- Register / Account Request
- Admin Approval Screen

Design requirements:
- Use realistic Turkish UI labels.
- Use compact enterprise dashboard layout.
- Use tables where tables are better than cards.
- Use cards only for summaries, tasks, and repeated items.
- Avoid large blank areas.
- Make admin and employee permissions visually clear.
- Add realistic empty states.
- Add loading states.
- Add error states.
- Add notification badge states.
- Add drawer/modal examples.
- Make the Obsidian Demo page feel distinctive and powerful.
- Keep the design suitable for a company owner/admin who wants to monitor operations quickly.