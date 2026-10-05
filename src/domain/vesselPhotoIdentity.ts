const IMO_WEIGHTS = [7, 6, 5, 4, 3, 2] as const

export const isValidImo = (value: string) =>
  /^[0-9]{7}$/.test(value) &&
  IMO_WEIGHTS.reduce(
    (total, weight, index) => total + Number(value[index]) * weight,
    0,
  ) % 10 === Number(value[6])

export const isValidVesselPhotoNumber = (number: string) =>
  isValidImo(number) || /^[2-7][0-9]{8}$/.test(number)
