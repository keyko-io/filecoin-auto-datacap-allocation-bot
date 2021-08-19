import ByteConverter from '@wtfcode/byte-converter'
const byteConverter = new ByteConverter()


export const matchGroup = (regex, content) => {
  let m
  if ((m = regex.exec(content)) !== null) {
    if (m.length >= 2) {
      return m[1]
    }
    return m[0]
  }
}

export const matchAll = (regex, content) => {
  var matches = [...content.matchAll(regex)]
  if (matches !== null) {
    // each entry in the array has this form: Array ["#### Address > f1111222333", "", "f1111222333"]
    return matches.map(elem => elem[2])
  }
}


export function anyToBytes(inputDatacap: any) {
  const ext = inputDatacap.replace(/[0-9.]/g, '')
  const datacap = inputDatacap.replace(/[^0-9.]/g, '')
  const bytes = byteConverter.convert(datacap, ext, 'B')
  return bytes
}

export function bytesToiB(inputBytes: any) {
  const autoscale = byteConverter.autoScale(Number(inputBytes), 'B', { preferByte: true, preferBinary: true } as any)
  return `${Number.isInteger(autoscale.value) ? autoscale.value : autoscale.value.toFixed(1)}${autoscale.dataFormat}`
}

export function bytesToB(inputBytes: any) {
  const autoscale = byteConverter.autoScale(Number(inputBytes), 'B', { preferByte: true, preferDecimal: true } as any)
  return `${Number.isInteger(autoscale.value) ? autoscale.value : autoscale.value.toFixed(1)}${autoscale.dataFormat}`
}
