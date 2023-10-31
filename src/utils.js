export function isRectEqual(lhs, rhs) {
  return lhs.x === rhs.x && lhs.y === rhs.y && lhs.width === rhs.width && lhs.height === rhs.height
}

export function parseTilingSteps(value, defaultValue) {
  try {
    return value
      .split(",")
      .map((step) => {
        const numbers = step.split(";").map((str) => {
          const number = Math.max(0.0, Math.min(1.0, parseFloat(str.trim())))
          if (isNaN(number) || typeof number !== 'number') {
            throw new Error("Expected a number")
          }
          return number
        })
        return numbers
      })
  } catch {
    return defaultValue
  }
}