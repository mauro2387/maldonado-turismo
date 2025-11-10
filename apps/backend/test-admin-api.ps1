# Script de prueba para Admin API
# Ejecutar: .\test-admin-api.ps1

$baseUrl = "http://localhost:3000/api/v1"
$token = $null

Write-Host "Testing Maldonado Turismo Admin API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. LOGIN
Write-Host "1. Testing Login..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@maldonado.gub.uy"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json"
    
    $token = $response.access_token
    Write-Host "[OK] Login successful!" -ForegroundColor Green
    Write-Host "   User: $($response.user.name) ($($response.user.role))" -ForegroundColor Gray
    Write-Host "   Token: $($token.Substring(0, 50))..." -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "[ERROR] Login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "[WARNING] Make sure:" -ForegroundColor Yellow
    Write-Host "   - Backend is running on port 3000" -ForegroundColor Yellow
    Write-Host "   - admin-schema.sql was executed in Supabase" -ForegroundColor Yellow
    exit 1
}

# 2. PROFILE
Write-Host "2. Testing Profile..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    $profile = Invoke-RestMethod -Uri "$baseUrl/admin/auth/profile" `
        -Method GET `
        -Headers $headers
    
    Write-Host "[OK] Profile retrieved!" -ForegroundColor Green
    Write-Host "   Name: $($profile.name)" -ForegroundColor Gray
    Write-Host "   Email: $($profile.email)" -ForegroundColor Gray
    Write-Host "   Role: $($profile.role)" -ForegroundColor Gray
    Write-Host "   Department: $($profile.department)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "[ERROR] Profile failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. CREATE PLACE
Write-Host "3. Testing Create Place..." -ForegroundColor Yellow
$placeBody = @{
    name = "Test Place - API"
    description = "Lugar de prueba creado desde script PowerShell"
    category = "museo"
    address = "Dirección de prueba 123"
    coordinates = @{
        lat = -34.9077
        lng = -54.9594
    }
    phone = "+598 1234 5678"
    email = "test@example.com"
    opening_hours = @{
        lunes = "9:00-17:00"
        martes = "9:00-17:00"
    }
    tags = @("test", "api", "prueba")
    featured = $false
} | ConvertTo-Json -Depth 10

try {
    $newPlace = Invoke-RestMethod -Uri "$baseUrl/places" `
        -Method POST `
        -Body $placeBody `
        -ContentType "application/json" `
        -Headers $headers
    
    Write-Host "[OK] Place created!" -ForegroundColor Green
    Write-Host "   ID: $($newPlace.id)" -ForegroundColor Gray
    Write-Host "   Name: $($newPlace.name)" -ForegroundColor Gray
    $placeId = $newPlace.id
    Write-Host ""
} catch {
    Write-Host "[ERROR] Create Place failed: $($_.Exception.Message)" -ForegroundColor Red
    $placeId = $null
}

# 4. UPDATE PLACE
if ($placeId) {
    Write-Host "4. Testing Update Place..." -ForegroundColor Yellow
    $updateBody = @{
        name = "Test Place - UPDATED"
        description = "Descripción actualizada desde script"
    } | ConvertTo-Json

    try {
        $updated = Invoke-RestMethod -Uri "$baseUrl/places/$placeId" `
            -Method PUT `
            -Body $updateBody `
            -ContentType "application/json" `
            -Headers $headers
        
        Write-Host "[OK] Place updated!" -ForegroundColor Green
        Write-Host "   New name: $($updated.name)" -ForegroundColor Gray
        Write-Host ""
    } catch {
        Write-Host "[ERROR] Update Place failed: $($_.Exception.Message)" -ForegroundColor Red
    }

    # 5. DELETE PLACE
    Write-Host "5. Testing Delete Place..." -ForegroundColor Yellow
    try {
        Invoke-RestMethod -Uri "$baseUrl/places/$placeId" `
            -Method DELETE `
            -Headers $headers
        
        Write-Host "[OK] Place deleted!" -ForegroundColor Green
        Write-Host ""
    } catch {
        Write-Host "[ERROR] Delete Place failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 6. CREATE EVENT
Write-Host "6. Testing Create Event..." -ForegroundColor Yellow
$eventBody = @{
    title = "Test Event - API"
    description = "Evento de prueba desde script PowerShell"
    category = "cultura"
    start_date = (Get-Date).AddDays(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    end_date = (Get-Date).AddDays(31).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    location = "Lugar de prueba"
    organizer = "Departamento de Cultura"
    contact_email = "cultura@test.com"
    price = "Gratis"
    tags = @("test", "api")
    featured = $false
} | ConvertTo-Json -Depth 10

try {
    $newEvent = Invoke-RestMethod -Uri "$baseUrl/events" `
        -Method POST `
        -Body $eventBody `
        -ContentType "application/json" `
        -Headers $headers
    
    Write-Host "[OK] Event created!" -ForegroundColor Green
    Write-Host "   ID: $($newEvent.id)" -ForegroundColor Gray
    Write-Host "   Title: $($newEvent.title)" -ForegroundColor Gray
    $eventId = $newEvent.id
    Write-Host ""
} catch {
    Write-Host "[ERROR] Create Event failed: $($_.Exception.Message)" -ForegroundColor Red
    $eventId = $null
}

# 7. CREATE NEWS
Write-Host "7. Testing Create News..." -ForegroundColor Yellow
$newsBody = @{
    title = "Test News - API"
    summary = "Resumen de noticia de prueba"
    content = "Contenido completo de la noticia de prueba creada desde script PowerShell"
    category = "turismo"
    author = "Test Script"
    tags = @("test", "api")
    featured = $false
    published = $true
} | ConvertTo-Json -Depth 10

try {
    $newNews = Invoke-RestMethod -Uri "$baseUrl/news" `
        -Method POST `
        -Body $newsBody `
        -ContentType "application/json" `
        -Headers $headers
    
    Write-Host "[OK] News created!" -ForegroundColor Green
    Write-Host "   ID: $($newNews.id)" -ForegroundColor Gray
    Write-Host "   Title: $($newNews.title)" -ForegroundColor Gray
    $newsId = $newNews.id
    Write-Host ""
} catch {
    Write-Host "[ERROR] Create News failed: $($_.Exception.Message)" -ForegroundColor Red
    $newsId = $null
}

# 8. CREATE TRANSPORT ROUTE
Write-Host "8. Testing Create Transport Route..." -ForegroundColor Yellow
$routeBody = @{
    route_number = "999"
    name = "Test Route - API"
    description = "Ruta de prueba desde script"
    operator = "Test Operator"
    type = "urbano"
    color = "#FF5733"
    active = $true
} | ConvertTo-Json -Depth 10

try {
    $newRoute = Invoke-RestMethod -Uri "$baseUrl/transport/routes" `
        -Method POST `
        -Body $routeBody `
        -ContentType "application/json" `
        -Headers $headers
    
    Write-Host "[OK] Transport Route created!" -ForegroundColor Green
    Write-Host "   ID: $($newRoute.id)" -ForegroundColor Gray
    Write-Host "   Route: $($newRoute.route_number) - $($newRoute.name)" -ForegroundColor Gray
    $routeId = $newRoute.id
    Write-Host ""
} catch {
    Write-Host "[ERROR] Create Route failed: $($_.Exception.Message)" -ForegroundColor Red
    $routeId = $null
}

# 9. LOGOUT
Write-Host "9. Testing Logout..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "$baseUrl/admin/auth/logout" `
        -Method POST `
        -Headers $headers
    
    Write-Host "[OK] Logout successful!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Logout failed: $($_.Exception.Message)" -ForegroundColor Red
}

# SUMMARY
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Created entities (clean up manually if needed):" -ForegroundColor Yellow
if ($eventId) { Write-Host "  - Event ID: $eventId" -ForegroundColor Gray }
if ($newsId) { Write-Host "  - News ID: $newsId" -ForegroundColor Gray }
if ($routeId) { Write-Host "  - Route ID: $routeId" -ForegroundColor Gray }
Write-Host ""
Write-Host "Check Audit Log in Supabase:" -ForegroundColor Yellow
Write-Host "   SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20;" -ForegroundColor Gray
Write-Host ""
Write-Host "[OK] All tests completed!" -ForegroundColor Green
