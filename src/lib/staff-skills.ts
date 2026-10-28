export function hasRequiredSkills(required: readonly string[], skills: readonly string[]): boolean {
  return required.every(skill => skills.includes(skill));
}
