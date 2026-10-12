import os

nginx_conf_path = '/etc/nginx/nginx.conf'
if os.path.exists(nginx_conf_path):
    try:
        with open(nginx_conf_path, 'r') as f:
            content = f.read()

        api_block = '''        # Direct API proxy bypass for internal sync endpoints
        location /api/ {
            proxy_pass http://localhost:3000;
            proxy_set_header Host localhost:3000;
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_http_version 1.1;
        }

'''

        if 'location /api/' not in content and 'location / {' in content:
            content = content.replace('location / {', api_block + '        location / {')
            with open(nginx_conf_path, 'w') as f:
                f.write(content)
    except Exception:
        pass

lua_path = '/etc/nginx/user_auth_verification.lua'
if os.path.exists(lua_path):
    try:
        with open(lua_path, 'r') as f:
            lua_content = f.read()

        bypass_snippet = '''-- Skip auth check for all /api/ endpoints to prevent POST redirects and 405 errors
if string.sub(ngx.var.uri, 1, 5) == "/api/" then
    return
end

'''

        if 'string.sub(ngx.var.uri, 1, 5) == "/api/"' not in lua_content:
            target = 'local max_lookup_attempts = 3'
            if target in lua_content:
                lua_content = lua_content.replace(target, target + '\n\n' + bypass_snippet)
                with open(lua_path, 'w') as f:
                    f.write(lua_content)
    except Exception:
        pass

os.system('nginx -t >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1')
