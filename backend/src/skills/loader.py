"""Skills loader - scan and parse SKILL.md files."""
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import structlog
import yaml

logger = structlog.get_logger()

GLOBAL_CONFIG_DIR = Path(__file__).parent.parent.parent / "global_config"


@dataclass
class SkillConfig:
    """Parsed skill configuration."""

    name: str
    description: str = ""
    content: str = ""
    metadata: dict = field(default_factory=dict)


def parse_skill_file(path: Path) -> Optional[SkillConfig]:
    """Parse a SKILL.md file with YAML frontmatter."""
    try:
        text = path.read_text(encoding="utf-8")
        name = path.stem

        frontmatter_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
        if frontmatter_match:
            frontmatter = yaml.safe_load(frontmatter_match.group(1)) or {}
            body = text[frontmatter_match.end():]
        else:
            frontmatter = {}
            body = text

        return SkillConfig(
            name=frontmatter.get("name", name),
            description=frontmatter.get("description", ""),
            content=body.strip(),
            metadata=frontmatter,
        )
    except Exception as e:
        logger.warning("skill_parse_failed", path=str(path), error=str(e))
        return None


def load_global_skills() -> dict[str, SkillConfig]:
    """Scan global_config/skills/*.md and return parsed skills."""
    skills_dir = GLOBAL_CONFIG_DIR / "skills"
    if not skills_dir.exists():
        return {}

    skills = {}
    for md_file in skills_dir.glob("*.md"):
        skill = parse_skill_file(md_file)
        if skill:
            skills[skill.name] = skill

    logger.debug("global_skills_loaded", count=len(skills))
    return skills


def parse_workflow_skills(skills_data: Optional[list]) -> dict[str, SkillConfig]:
    """Parse skills from workflow DB field."""
    if not skills_data:
        return {}

    skills = {}
    for item in skills_data:
        if isinstance(item, dict):
            name = item.get("name", "")
            if name:
                skills[name] = SkillConfig(
                    name=name,
                    description=item.get("description", ""),
                    content=item.get("content", ""),
                    metadata=item.get("metadata", {}),
                )
    return skills


def merge_skills(
    global_skills: dict[str, SkillConfig],
    workflow_skills: dict[str, SkillConfig],
) -> dict[str, SkillConfig]:
    """Merge skills: same name -> workflow overrides, different names -> keep both."""
    merged = dict(global_skills)
    merged.update(workflow_skills)
    return merged


def get_merged_skills_for_workflow(workflow_skills: Optional[list]) -> dict[str, SkillConfig]:
    """Get merged skills for a workflow."""
    global_skills = load_global_skills()
    wf_skills = parse_workflow_skills(workflow_skills)
    return merge_skills(global_skills, wf_skills)
