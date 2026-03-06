#!/bin/bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch Personal/DiagnosticoPensiones.html" \
  --prune-empty --tag-name-filter cat -- --all
