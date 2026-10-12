import os

lua_path = '/etc/nginx/user_auth_verification.lua'
if os.path.exists(lua_path):
    with open(lua_path, 'r') as f:
        content = f.read()

    bypass_snippet = '''-- Skip auth check for all /api/ endpoints to prevent POST redirects and 405 errors
if string.sub(ngx.var.uri, 1, 5) == "/api/" then
    return
end

'''

    if 'string.sub(ngx.var.uri, 1, 5) == "/api/"' not in content:
        # Insert after initial requires/variables
        target = 'local max_lookup_attempts = 3'
        if target in content:
            content = content.replace(target, target + '\n\n' + bypass_snippet)
            with open(lua_path, 'w') as f:
                f.write(content)
            print('Successfully updated user_auth_verification.lua')
            os.system('nginx -t && nginx -s reload')
        else:
            print('Target not found in lua file')
    else:
        print('Bypass already present in lua file')
