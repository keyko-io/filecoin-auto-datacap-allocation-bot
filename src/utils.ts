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


export function anyToBytes(inputDatacap: string) {
  const formatDc = inputDatacap.replace(/[t]/g, "T").replace(/[b]/g, "B").replace(/[p]/g, "P").replace(/[I]/g, "i").replace(/\s*/g, "")
  const ext = formatDc.replace(/[0-9.]/g, '')
  const datacap = formatDc.replace(/[^0-9.]/g, '')
  const bytes = byteConverter.convert(parseInt(datacap), ext, 'B')
  return bytes
}

export function bytesToiB(inputBytes: number) {
  let autoscale = byteConverter.autoScale(inputBytes, 'B', { preferByte: true, preferBinary: true } as any)
  //this is bc it cannot convert 1099511627776000 to 1PiB
  if (autoscale.dataFormat === "YiB") {
    autoscale = byteConverter.autoScale(inputBytes-32, 'B', { preferByte: true, preferBinary: true } as any)
    return `${(autoscale.value / 1024).toFixed(1)}${"PiB"}`
}
return `${autoscale.value}${autoscale.dataFormat}`
  // return `${Number.isInteger(autoscale.value) ? autoscale.value : autoscale.value.toFixed(1)}${autoscale.dataFormat}`
}

export function bytesToB(inputBytes: number) {
  const autoscale = byteConverter.autoScale(inputBytes, 'B', { preferByte: true, preferDecimal: true } as any)
  return `${Number.isInteger(autoscale.value) ? autoscale.value : autoscale.value.toFixed(1)}${autoscale.dataFormat}`
}
