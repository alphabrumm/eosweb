// Nach dem Build: Server-Einstellungen für Apache-Webspaces
import { writeFileSync } from "fs";

const out = "dist";
writeFileSync(`${out}/.htaccess`, `# wEOS: Einstellungen für Apache-Webserver
AddType application/manifest+json .webmanifest
AddType text/javascript .js .mjs

# Immer HTTPS (nötig für Offline-Modus und Teilen-Menü auf dem iPad)
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} !=on
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "\\.(js|css|woff2?|png|svg)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "index\\.html$|eos-sw\\.js$|\\.webmanifest$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
`);
console.log("wEOS: dist ist fertig zum Hochladen.");
