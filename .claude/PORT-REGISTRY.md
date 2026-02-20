# Port Registry

## Port Allocation Rules

| Range | Purpose |
|-------|---------|
| 3200-3299 | Frontend applications |
| 5100-5199 | Backend APIs |
| 8081-8099 | Mobile development servers |

## Port Assignment Process

When creating a new product, assign the next available port in each range.

## Registered Ports

### Frontend Applications (3200-3299)

| Port | Product | Status | URL |
|------|---------|--------|-----|
| 3213 | command-center | Active | http://localhost:3213 |

### Backend APIs (5100-5199)

| Port | Product | Status | URL |
|------|---------|--------|-----|
| 5109 | command-center | Active | http://localhost:5109 |

### Mobile Development (8081-8099)

| Port | Product | Status | URL |
|------|---------|--------|-----|

### Databases

Use default ports in Docker with unique container names per product.

## Quick Reference Commands

```bash
# Check if a port is in use
lsof -i :PORT_NUMBER

# Kill process on a port
kill -9 $(lsof -ti :PORT_NUMBER)
```
