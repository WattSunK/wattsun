
WattSun Solar Netlify CMS Blog Starter Pack
-------------------------------------------

INSTRUCTIONS:

1. Place the 'blog' and 'admin' folders into your website project root.
2. Update 'admin/config.yml' with your correct GitHub repo (see the comment inside).
3. Commit and push to GitHub.
4. Deploy or connect your repo to Netlify.
5. On Netlify:
   a) Enable Identity (Site settings > Identity > Enable Identity).
   b) Enable Git Gateway (Identity > Services > Enable Git Gateway).
   c) Invite yourself (your email) as a site admin under Identity.
6. Visit '/admin' on your live site to log in and start editing/creating blog posts!

All posts live in '/blog/posts/' as Markdown (.md) files.

To add a new post manually:
- Copy 'post-1.md', rename, and edit the front matter and content.

To display more posts in the index, update the JS in 'blog/index.html' or switch to a static site generator for automation.

-- The WattSun Solar Team
