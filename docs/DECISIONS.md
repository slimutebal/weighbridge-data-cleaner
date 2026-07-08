# Decisions

This file records architecture and implementation decisions.

## D001 - App Architecture

Use a browser-based local web app with HTML, CSS, and vanilla JavaScript.

## D002 - Source Profiles

Supported profiles:
- HYNC
- SLNC
- ESG

## D003 - Shift Input

Use two input buckets:
- Day Shift Input
- Night Shift Input

Bucket is user intent only. Actual shift must be validated from timestamps.

## D004 - Result Grouping

Group results by:

Profile + Date + Detected Shift

## D005 - List DT

List DT requires only:
- dt_id
- contractor
