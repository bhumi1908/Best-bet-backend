# Quick Fix for ECONNREFUSED Error

## Immediate Steps

### Step 1: Check if PostgreSQL is Running

**Windows:**
1. Press `Win + R`, type `services.msc`, press Enter
2. Look for `postgresql-x64-XX` (where XX is version number)
3. If it's **Stopped**, right-click → **Start**
4. If it doesn't exist, PostgreSQL might not be installed

**Alternative:**
- Open Task Manager → Services tab
- Look for PostgreSQL service

### Step 2: Test Database Connection

Run this command to test your connection:

```bash
npm run test:db
```

Or:

```bash
node test-connection.js
```

This will tell you exactly what's wrong:
- ✅ If connection works → PostgreSQL is running and credentials are correct
- ❌ If connection fails → See error message for specific issue

### Step 3: Verify Your .env File

Make sure your `.env` file exists in `Best-Best BE` folder and has:

```env
DB_HOST=localhost
# OR if using IP:
# DB_HOST=127.0.0.1

DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password_here
DB_NAME=best_bet
```

**Important:** 
- Replace `your_actual_password_here` with your real PostgreSQL password
- The database name should match what you created in pgAdmin

### Step 4: Create Database in pgAdmin (if it doesn't exist)

1. Open **pgAdmin4**
2. Connect to your PostgreSQL server
3. Right-click **"Databases"** → **Create** → **Database**
4. Name: `best_bet` (or whatever you set in DB_NAME)
5. Click **Save**

### Step 5: Run Migrations

After connection works:

```bash
npm run prisma:migrate
```

This creates the `users` and `uploads` tables.

### Step 6: Start Server

```bash
npm run dev
```

## Common Issues & Solutions

### Issue: "ECONNREFUSED"

**Cause:** PostgreSQL service is not running

**Solution:**
1. Start PostgreSQL service (see Step 1)
2. Wait 10-20 seconds for it to fully start
3. Try again

### Issue: "Database does not exist" (Error code: 3D000)

**Cause:** Database `best_bet` doesn't exist

**Solution:**
1. Create database in pgAdmin (see Step 4)
2. Restart server

### Issue: "Password authentication failed" (Error code: 28P01)

**Cause:** Wrong password in `.env` file

**Solution:**
1. Test password in pgAdmin first
2. Update `DB_PASSWORD` in `.env` file
3. Make sure password doesn't have extra spaces
4. If password has special characters, they should work (auto-encoded)

### Issue: "Connection timeout"

**Cause:** PostgreSQL is running but not accepting connections

**Solution:**
1. Check if PostgreSQL is listening on port 5432:
   ```bash
   netstat -an | findstr 5432
   ```
2. Check Windows Firewall isn't blocking PostgreSQL
3. Try changing `DB_HOST` from `127.0.0.1` to `localhost` or vice versa

## Still Not Working?

1. **Test connection script:**
   ```bash
   npm run test:db
   ```

2. **Check PostgreSQL logs:**
   - Usually in: `C:\Program Files\PostgreSQL\XX\data\log\`
   - Look for error messages

3. **Verify PostgreSQL installation:**
   - Try connecting via pgAdmin manually
   - If pgAdmin can't connect, the issue is with PostgreSQL itself, not your code

4. **Check if another PostgreSQL instance is running:**
   - Sometimes multiple PostgreSQL versions conflict
   - Check all services starting with "postgresql"

## Success Indicators

When everything works, you'll see:

```
🔌 Testing database connection...
✅ Direct PostgreSQL connection successful
   Server time: 2024-01-01T12:00:00.000Z
✅ Prisma Client connected successfully
📦 Prisma Client initialized and ready
✅ Database connected successfully
🚀 Server is running on port 3001
```

Then you can test the registration API in Postman! 🎉

