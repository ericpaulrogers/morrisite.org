<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" encoding="UTF-8" doctype-system="about:legacy-compat"/>
<xsl:template match="/rss/channel">
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>RSS feed: <xsl:value-of select="title"/></title>
<style>
:root{--paper:#eceee8;--panel:#f6f7f3;--ink:#1c2320;--muted:#59645e;--rule:#c5cbc2;--accent:#2c5a70}
@media (prefers-color-scheme:dark){:root{--paper:#131917;--panel:#1a2220;--ink:#e2e6df;--muted:#9aa69f;--rule:#34403b;--accent:#8db6c9}}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 "Literata",Georgia,"Times New Roman",serif}
.wrap{max-width:46rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1{font:400 2rem/1.2 "IM Fell English","Iowan Old Style",Georgia,serif;margin:0 0 .5rem}
a{color:var(--accent)}
.note{background:var(--panel);border:1px solid var(--rule);border-radius:6px;padding:1rem 1.25rem;margin:1.25rem 0 2rem}
.note p{margin:.4rem 0}
code{font:14px "IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;background:var(--paper);border:1px solid var(--rule);border-radius:4px;padding:.15rem .4rem;word-break:break-all}
ol{list-style:none;padding:0;margin:0}
li{border-top:1px solid var(--rule);padding:.8rem 0}
.date{display:block;color:var(--muted);font-size:.85rem;letter-spacing:.03em}
</style>
</head>
<body><div class="wrap">
<p><a href="index.html">Morrisite.org</a> &#8250; <a href="whats-new.html">What&#8217;s new</a></p>
<h1>RSS feed</h1>
<div class="note">
<p><strong>This is a news feed.</strong> To follow new additions to the guide, copy this page&#8217;s address into a feed reader (such as Feedly, Inoreader, NetNewsWire or your email program&#8217;s RSS option):</p>
<p><code>https://morrisite.org/feed.xml</code></p>
<p>You don&#8217;t need a feed reader to read the updates: they are all on the <a href="whats-new.html">What&#8217;s new</a> page.</p>
</div>
<h2 style="font:400 1.3rem 'IM Fell English',Georgia,serif;margin:0 0 .5rem">Recent additions</h2>
<ol>
<xsl:for-each select="item">
<li><span class="date"><xsl:value-of select="substring(pubDate,6,11)"/></span>
<a href="{link}"><xsl:value-of select="title"/></a></li>
</xsl:for-each>
</ol>
</div></body></html>
</xsl:template>
</xsl:stylesheet>
