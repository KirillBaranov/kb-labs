#!/usr/bin/env python3
"""
ADR Audit Script
Scans all ADR files and creates an audit report with their current format status.
"""

import os
import re
from pathlib import Path
from typing import Dict, List, Tuple

def find_all_adr_files(root: str) -> List[Path]:
    """Find all ADR files excluding templates."""
    adr_files = []
    root_path = Path(root)
    
    for adr_file in root_path.rglob("**/adr/*.md"):
        if adr_file.name != "0000-template.md":
            adr_files.append(adr_file)
    
    return sorted(adr_files)

def parse_adr_metadata(content: str) -> Dict[str, any]:
    """Parse ADR metadata from file content."""
    metadata = {
        "has_date": False,
        "has_status": False,
        "has_deciders": False,
        "has_last_reviewed": False,
        "has_tags": False,
        "has_reviewers": False,
        "date_value": None,
        "status_value": None,
        "format": "unknown",
        "needs_update": False
    }
    
    # Check for different date formats
    date_patterns = [
        r'\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})',
        r'Date:\s*(\d{4}-\d{2}-\d{2})',
        r'-\s*\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})',
        r'^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})',
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, content, re.MULTILINE)
        if match:
            metadata["has_date"] = True
            metadata["date_value"] = match.group(1)
            break
    
    # Check for status
    status_patterns = [
        r'\*\*Status:\*\*\s*([^\n]+)',
        r'Status:\s*([^\n]+)',
        r'-\s*\*\*Status:\*\*\s*([^\n]+)',
    ]
    for pattern in status_patterns:
        match = re.search(pattern, content, re.MULTILINE)
        if match:
            metadata["has_status"] = True
            metadata["status_value"] = match.group(1).strip()
            break
    
    # Check for deciders
    deciders_patterns = [
        r'\*\*Deciders:\*\*\s*([^\n]+)',
        r'Deciders:\s*([^\n]+)',
        r'-\s*\*\*Author:\*\*\s*([^\n]+)',
    ]
    for pattern in deciders_patterns:
        match = re.search(pattern, content, re.MULTILINE)
        if match:
            metadata["has_deciders"] = True
            break
    
    # Check for last reviewed
    if re.search(r'\*\*Last Reviewed:\*\*', content, re.IGNORECASE):
        metadata["has_last_reviewed"] = True
    
    # Check for tags
    if re.search(r'\*\*Tags:\*\*', content, re.IGNORECASE):
        metadata["has_tags"] = True
    
    # Check for reviewers
    if re.search(r'\*\*Reviewers:\*\*', content, re.IGNORECASE):
        metadata["has_reviewers"] = True
    
    # Determine format
    if metadata["has_date"] and metadata["has_status"] and metadata["has_deciders"]:
        if metadata["has_last_reviewed"] and metadata["has_tags"]:
            metadata["format"] = "new_standard"
            metadata["needs_update"] = False
        else:
            metadata["format"] = "old_format_missing_fields"
            metadata["needs_update"] = True
    else:
        metadata["format"] = "incomplete"
        metadata["needs_update"] = True
    
    return metadata

def group_by_project(adr_files: List[Path], root: str) -> Dict[str, List[Tuple[Path, Dict]]]:
    """Group ADR files by project."""
    projects = {}
    root_path = Path(root)
    
    for adr_file in adr_files:
        # Get relative path from root
        rel_path = adr_file.relative_to(root_path)
        # Extract project name (first directory)
        project_name = rel_path.parts[0]
        
        if project_name not in projects:
            projects[project_name] = []
        
        # Read and parse ADR
        try:
            content = adr_file.read_text(encoding='utf-8')
            metadata = parse_adr_metadata(content)
            projects[project_name].append((adr_file, metadata))
        except Exception as e:
            print(f"Error reading {adr_file}: {e}")
    
    return projects

def generate_audit_report(root: str) -> str:
    """Generate ADR audit report."""
    adr_files = find_all_adr_files(root)
    projects = group_by_project(adr_files, root)
    
    report_lines = []
    report_lines.append("# ADR Format Audit Report")
    report_lines.append("")
    report_lines.append(f"**Generated:** {Path(__file__).stat().st_mtime}")
    report_lines.append(f"**Total ADR Files:** {len(adr_files)}")
    report_lines.append("")
    report_lines.append("## Summary")
    report_lines.append("")
    
    # Count by format
    format_counts = {"new_standard": 0, "old_format_missing_fields": 0, "incomplete": 0, "unknown": 0}
    total_needs_update = 0
    
    for project, files in projects.items():
        for _, metadata in files:
            format_counts[metadata["format"]] = format_counts.get(metadata["format"], 0) + 1
            if metadata["needs_update"]:
                total_needs_update += 1
    
    report_lines.append(f"- ✅ **New Standard Format:** {format_counts['new_standard']}")
    report_lines.append(f"- ⚠️ **Old Format (Missing Fields):** {format_counts['old_format_missing_fields']}")
    report_lines.append(f"- ❌ **Incomplete:** {format_counts['incomplete']}")
    report_lines.append(f"- 📝 **Total Needing Update:** {total_needs_update}")
    report_lines.append("")
    report_lines.append("## Required Updates")
    report_lines.append("")
    report_lines.append("All ADRs must have the following fields:")
    report_lines.append("- `Date` - Creation date (preserve original)")
    report_lines.append("- `Status` - Current status")
    report_lines.append("- `Deciders` - Who made the decision")
    report_lines.append("- `Last Reviewed` - Date of last review (add if missing)")
    report_lines.append("- `Tags` - Array of tags (minimum 1, maximum 5, add if missing)")
    report_lines.append("")
    report_lines.append("## ADR Files by Project")
    report_lines.append("")
    
    # Sort projects
    for project in sorted(projects.keys()):
        report_lines.append(f"### {project}")
        report_lines.append("")
        
        files_list = projects[project]
        for adr_file, metadata in files_list:
            rel_path = adr_file.relative_to(Path(root))
            status_icon = "✅" if not metadata["needs_update"] else "⚠️" if metadata["format"] == "old_format_missing_fields" else "❌"
            
            report_lines.append(f"- {status_icon} `{rel_path}`")
            
            if metadata["needs_update"]:
                missing = []
                if not metadata["has_last_reviewed"]:
                    missing.append("Last Reviewed")
                if not metadata["has_tags"]:
                    missing.append("Tags")
                if not metadata["has_date"]:
                    missing.append("Date")
                if not metadata["has_status"]:
                    missing.append("Status")
                if not metadata["has_deciders"]:
                    missing.append("Deciders")
                
                if missing:
                    report_lines.append(f"  - Missing: {', '.join(missing)}")
                
                if metadata["date_value"]:
                    report_lines.append(f"  - Original Date: {metadata['date_value']} (preserve)")
            
            report_lines.append("")
    
    return "\n".join(report_lines)

if __name__ == "__main__":
    root = "/Users/kirillbaranov/Desktop/kb-labs"
    report = generate_audit_report(root)
    
    output_file = Path(root) / "kb-labs" / "docs" / "ADR_AUDIT.md"
    output_file.write_text(report, encoding='utf-8')
    print(f"Audit report written to: {output_file}")
    print(f"Total ADR files analyzed: {len(find_all_adr_files(root))}")


