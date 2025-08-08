# Render Deployment Configuration for Schedula Backend

## 🚀 Render.com Deployment Steps

### 1. Create PostgreSQL Database
- Go to [Render Dashboard](https://dashboard.render.com)
- Click "New" → "PostgreSQL"
- Database Name: `schedula-db-shivaprasad`
- Region: `Oregon (US West)`
- Plan: `Free`
- **Copy the External Database URL** - you'll need this for environment variables

### 2. Create Web Service
- Click "New" → "Web Service"
- Connect Repository: `https://github.com/shiva-39/schedula-backend-shivaprasad`
- Branch: `main`
- Root Directory: ` ` (leave empty)
- Region: `Oregon (US West)` (same as database)
- Plan: `Free`

### 3. Build Settings
```
Build Command: npm install && npx nest build
Start Command: npm run migration:run:prod && npm run start:prod
```

### 4. Environment Variables
```
DATABASE_URL = [YOUR_POSTGRESQL_DATABASE_URL_FROM_RENDER]
JWT_SECRET = [YOUR_SECURE_JWT_SECRET]
NODE_ENV = production
PORT = 3000
```

**⚠️ SECURITY NOTE**: Replace the bracketed values with your actual credentials from Render dashboard. Never commit real credentials to version control.

### 5. Expected Deployment URL
After deployment, your API will be available at:
```
https://schedula-backend-shivaprasad.onrender.com
```

### 6. Test Endpoints
Once deployed, test these endpoints:
- `GET /` - Hello World
- `POST /api/auth/doctor/register` - Doctor Registration
- `POST /api/doctors/{id}/shrink-schedule` - Progressive Fitting Algorithm

### 7. Auto-Deployment
Every time you run `./sync-and-deploy.ps1`, Render will automatically:
- Detect changes in your `main` branch
- Rebuild and redeploy your application
- Update your live API with latest code

## 🧪 Testing Your Progressive Fitting Algorithm

Use the `manager-demo-simple.http` file to test:
1. Replace `@baseUrl = http://localhost:3000` with your Render URL
2. Run the test scenarios to verify deployment
