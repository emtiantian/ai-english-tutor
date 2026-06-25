-- ── CORS Handler for AI English Tutor Gateway ──
-- Reads CORS_ORIGIN env var (comma-separated) and dynamically sets headers.
-- Handles OPTIONS preflight requests with 204.

local function split_csv(str)
    local result = {}
    for item in str:gmatch("[^,]+") do
        local trimmed = item:match("^%s*(.-)%s*$")
        if trimmed and #trimmed > 0 then
            result[trimmed] = true
        end
    end
    return result
end

local function get_allowed_origins()
    local cors_origin = os.getenv("CORS_ORIGIN") or "*"
    if cors_origin == "*" then
        return nil  -- nil means allow all
    end
    return split_csv(cors_origin)
end

local function resolve_origin(request_origin, allowed_origins)
    -- Wildcard: allow everything
    if allowed_origins == nil then
        return request_origin or "*"
    end

    -- No Origin header (non-browser request): allow first entry
    if not request_origin or request_origin == "" then
        for origin, _ in pairs(allowed_origins) do
            return origin
        end
        return "false"
    end

    -- Check whitelist
    if allowed_origins[request_origin] then
        return request_origin
    end

    -- Not in whitelist
    return "false"
end

-- ── Main ──
local request_origin = ngx.req.get_headers()["Origin"]
local allowed_origins = get_allowed_origins()
local origin = resolve_origin(request_origin, allowed_origins)

-- Set CORS headers on every response
ngx.header["Access-Control-Allow-Origin"] = origin
ngx.header["Access-Control-Allow-Credentials"] = "true"
ngx.header["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
ngx.header["Access-Control-Expose-Headers"] = "Content-Type, Authorization"
ngx.header["Access-Control-Max-Age"] = "86400"

-- Handle OPTIONS preflight: return 204 immediately
if ngx.req.get_method() == "OPTIONS" then
    ngx.status = 204
    ngx.header["Content-Length"] = "0"
    return ngx.exit(204)
end
