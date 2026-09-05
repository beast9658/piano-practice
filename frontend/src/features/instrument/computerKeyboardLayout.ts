type ComputerKeyBinding = {
  key: string
  pitch: number
  label: string
}

const whiteLabels = '1234567890qwertyuiopasdfghjklzxcvbnm'.split('')
const blackLabels = [
  '!', '@', '$', '%', '^', '*', '(', 'Q', 'W', 'E', 'T', 'Y', 'I', 'O', 'P',
  'S', 'D', 'G', 'H', 'J', 'L', 'Z', 'C', 'V', 'B',
]
const blackPitchClasses = new Set([1, 3, 6, 8, 10])

export const computerKeyboardBindings: readonly ComputerKeyBinding[] = buildBindings()
export const computerKeyboardPitchByKey: ReadonlyMap<string, number> = new Map(
  computerKeyboardBindings.map((binding) => [binding.key, binding.pitch]),
)
export const computerKeyboardLabelByPitch: ReadonlyMap<number, string> = new Map(
  computerKeyboardBindings.map((binding) => [binding.pitch, binding.label]),
)

function buildBindings() {
  const bindings: ComputerKeyBinding[] = []
  let whiteIndex = 0
  let blackIndex = 0
  for (let pitch = 36; pitch <= 96; pitch += 1) {
    const isBlack = blackPitchClasses.has(pitch % 12)
    const label = isBlack ? blackLabels[blackIndex++] : whiteLabels[whiteIndex++]
    if (label) bindings.push({ key: label, pitch, label })
  }
  return bindings
}
