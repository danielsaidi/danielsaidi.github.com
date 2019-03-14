---
layout: default
title: Talks
permalink: /talks/
---

<article class="card">
  <h1>Talks</h1>
  <p>Here is a list of all talks that I have done at meetups, company events etc. I haven't been recording them, but some were recorded by the event host. Just let me know if you'd like me to put together a talk for an event at your meetup, company etc.</p>
</article>

{%- assign talks = site.talks | sort: 'date' | reverse -%}
{% for talk in talks %}
  {%- if talk.hidden -%}{%- else -%}
  {%- include talks/talk-list-item.html talk=talk -%}
  {%- endif -%}
{% endfor %}