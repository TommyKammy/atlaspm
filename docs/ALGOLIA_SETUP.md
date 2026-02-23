# Algolia Search Setup Guide for AtlasPM

This guide will help you set up Algolia to enable full-text search in AtlasPM.

## Quick Start

### Step 1: Create Algolia Account

1. Go to https://www.algolia.com/
2. Sign up for a free account (or use existing account)
3. Create a new application (or use existing one)

### Step 2: Get Your API Keys

1. In the Algolia Dashboard, go to **API Keys**
2. Copy your credentials:
   - **Application ID** (e.g., `ABCDEF1234`)
   - **Admin API Key** (for indexing)
   - **Search-Only API Key** (for frontend - optional but recommended)

### Step 3: Configure Environment Variables

Add to your `.env` file:

```bash
# Required for search functionality
ALGOLIA_APP_ID=your_application_id_here
ALGOLIA_API_KEY=your_admin_api_key_here
```

**Important**: Use the **Admin API Key** for the backend, as it needs write permissions to index tasks.

### Step 4: Restart Services

```bash
# Stop and restart core-api to pick up new environment variables
pnpm --filter core-api dev
```

### Step 5: Test Search

1. Create or update a task in the UI
2. Wait a few seconds for indexing
3. Use the search bar in the header
4. Verify results appear

## Verification

Check if search is working:

```bash
# Check search status
curl http://localhost:3001/search/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected response:
```json
{
  "isEnabled": true,
  "totalRecords": 42
}
```

## Production Deployment

### Using Environment Variables

**Docker Compose:**
```yaml
services:
  core-api:
    environment:
      - ALGOLIA_APP_ID=${ALGOLIA_APP_ID}
      - ALGOLIA_API_KEY=${ALGOLIA_API_KEY}
```

**Kubernetes:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: algolia-credentials
type: Opaque
stringData:
  ALGOLIA_APP_ID: "your_app_id"
  ALGOLIA_API_KEY: "your_api_key"
```

**Vercel/Netlify:**
Set environment variables in your dashboard:
- `ALGOLIA_APP_ID`
- `ALGOLIA_API_KEY`

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use Admin API Key only on backend** - never expose to frontend
3. **Restrict Admin API Key permissions** in Algolia dashboard if needed:
   - Enable only: `search`, `addObject`, `deleteObject`, `deleteIndex`
   - Disable: `settings` (after initial setup), `browse`, `logs`
4. **Rotate keys periodically** via Algolia dashboard

## Troubleshooting

### Search returns no results

1. Check if environment variables are set:
   ```bash
   echo $ALGOLIA_APP_ID
   echo $ALGOLIA_API_KEY
   ```

2. Check search status endpoint (see Verification above)

3. Check application logs for Algolia errors

4. Verify tasks are being indexed - check Algolia Dashboard for index "tasks"

### Index not created

The index is auto-created on first task creation/update. If you need to bulk index existing tasks:

```typescript
// Run this in your API console or create an endpoint
const tasks = await prisma.task.findMany();
await searchService.reindexAll(tasks);
```

### Rate limiting

Free tier allows:
- 10,000 search requests/month
- 10,000 indexing operations/month

If you hit limits:
1. Upgrade to paid plan
2. Implement search debouncing (already done - 200ms)
3. Reduce real-time indexing frequency

## Algolia Dashboard Tips

**Useful features:**
- **Search Analytics**: See what users are searching for
- **Query Suggestions**: Enable for better UX
- **Synonyms**: Configure common synonyms (e.g., "bug" = "issue")
- **Rules**: Set up merchandising or ranking rules

**Index settings** (auto-configured by app):
- Searchable attributes: title, description, tags
- Facets: projectId, assigneeId, status, priority, parentId, tags
- Ranking: By relevance, then by updatedAt

## Free Tier Limits

Algolia's free tier includes:
- 10,000 search requests/month
- 10,000 indexing operations/month
- 1 million records
- 10 GB storage

For most small-medium AtlasPM instances, this is sufficient.

## Need Help?

- Algolia Documentation: https://www.algolia.com/doc/
- Algolia Community: https://discourse.algolia.com/
- AtlasPM Issues: Create an issue in the repository
