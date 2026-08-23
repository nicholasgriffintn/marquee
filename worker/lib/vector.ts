export function normalise(vector: number[]) {
  const length = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));

  return length > 0 ? vector.map((value) => value / length) : vector;
}

export function dot(left: number[], right: number[]) {
  let total = 0;

  for (let index = 0; index < left.length; index += 1) {
    total += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return total;
}

export function cosine(left: number[], right: number[]) {
  const scale = Math.sqrt(dot(left, left)) * Math.sqrt(dot(right, right));

  return scale > 0 ? dot(left, right) / scale : 0;
}

export function centre(vectors: number[][]) {
  const dimensions = vectors[0]?.length ?? 0;
  const mean = Array.from<number>({ length: dimensions }).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < dimensions; index += 1) {
      mean[index] += (vector[index] ?? 0) / vectors.length;
    }
  }

  return vectors.map((vector) => vector.map((value, index) => value - (mean[index] ?? 0)));
}
