/**
* @module typedArrayConcat
*/
/**
* Concatenate n typed arrays
*
* @alias module:typedArrayConcat
* @param {TypedArray} ResultConstructor Returned typed array constructor
* @param {...TypedArray} arrays Arrays to concatenate
* @returns {TypedArray}
*/
function typedArrayConcat(ResultConstructor, ...arrays) {
	let totalLength = 0;
	for (const arr of arrays) totalLength += arr.length;
	const result = new ResultConstructor(totalLength);
	let offset = 0;
	for (const arr of arrays) {
		result.set(arr, offset);
		offset += arr.length;
	}
	return result;
}

/**
* @module typedArrayConstructor
*/
const upperBounds = /* @__PURE__ */ new Map();
upperBounds.set([Int8Array, Uint8Array], 255);
upperBounds.set([Int16Array, Uint16Array], 65535);
upperBounds.set([Int32Array, Uint32Array], 4294967295);
upperBounds.set([BigInt64Array, BigUint64Array], 2 ** 64 - 1);
const upperBoundsArray = Array.from(upperBounds.entries());
/**
* Get a typed array constructor based on the hypothetical max value it could contain. Signed or unsigned.
*
* @alias module:typedArrayConstructor
* @param {number} maxValue The max value expected.
* @param {boolean} signed Get a signed or unsigned array.
* @returns {(Uint8Array|Uint16Array|Uint32Array|BigInt64Array|Int8Array|Int16Array|Int32Array|BigInt64Array)}
* @see [MDN TypedArray objects]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray#typedarray_objects}
*/
const typedArrayConstructor = (maxValue, signed) => {
	const value = signed ? Math.abs(maxValue) : Math.max(0, maxValue);
	return upperBoundsArray[upperBoundsArray.findLastIndex(([_, bound]) => value > Math[Math.sign(maxValue) === -1 ? "ceil" : "floor"](bound / (signed ? 2 : 1))) + 1][0][signed ? 0 : 1];
};

const isAttributeFlat = (attribute) => !attribute[0]?.length;
const isAttributeTypedArray = (attribute) => !(attribute instanceof Array);
const isAttributeArrayLike = (attribute) => Array.isArray(attribute) || ArrayBuffer.isView(attribute);
const getGeometryAttributes = (geometry) => Object.keys(geometry).filter((attribute) => isAttributeArrayLike(geometry[attribute]));
function chunkAndOffset(array, stride, offset) {
	const result = [];
	let chunk = [];
	for (let i = 0; i < array.length; i++) {
		chunk.push(array[i] + offset);
		if (i % stride === stride - 1) {
			result.push(chunk);
			chunk = [];
		}
	}
	if (chunk.length) {
		console.warn(`Array length (${array.length}) is not a multiple of stride "${stride}".`);
		result.push(chunk);
	}
	return result;
}
const meta = Symbol("geom-merge-meta");
function merge(geometries) {
	let mergedPositionCount = 0;
	let areAllCellsFlatArray = true;
	let areAllCellsTypedArray = true;
	const initialAttributes = getGeometryAttributes(geometries[0]);
	let mergeableAttributes = [...initialAttributes];
	for (let i = 0; i < geometries.length; i++) {
		const geometry = geometries[i];
		if (i > 0) {
			const attributes = getGeometryAttributes(geometry);
			for (let j = 0; j < initialAttributes.length; j++) {
				const initialAttribute = initialAttributes[j];
				if (!attributes.includes(initialAttribute)) {
					console.warn(`geom-merge: geometry "${geometry.name || i}" is missing attribute ${initialAttribute}.`);
					mergeableAttributes = mergeableAttributes.filter((attribute) => attribute !== initialAttribute);
				}
			}
			const extraAttributes = attributes.filter((attribute) => !mergeableAttributes.includes(attribute));
			if (extraAttributes.length) console.warn(`geom-merge: geometry "${geometry.name || i}" has extra attributes: ${extraAttributes.join(", ")}.`);
		}
		const positionCount = geometry.positions.length / (isAttributeFlat(geometry.positions) ? 3 : 1);
		const isCellsFlatArray = isAttributeFlat(geometry.cells);
		geometry[meta] = {
			positionCount,
			isCellsFlatArray
		};
		mergedPositionCount += positionCount;
		areAllCellsFlatArray &&= isCellsFlatArray;
		areAllCellsTypedArray &&= isAttributeTypedArray(geometry.cells);
	}
	const extraAttributes = initialAttributes.filter((initialAttribute) => !mergeableAttributes.includes(initialAttribute));
	if (extraAttributes.length) console.warn(`geom-merge: geometry "${geometries[0].name || "0"}" has extra attributes: ${extraAttributes.join(", ")}.`);
	const CellsConstructor = areAllCellsTypedArray ? typedArrayConstructor(mergedPositionCount) : Array;
	const mergedGeometry = { cells: new CellsConstructor() };
	let vertexOffset = 0;
	for (let i = 0; i < geometries.length; i++) {
		const geometry = geometries[i];
		const { positionCount, isCellsFlatArray } = geometry[meta];
		for (let j = 0; j < mergeableAttributes.length; j++) {
			const attribute = mergeableAttributes[j];
			if (attribute === "cells") {
				if (areAllCellsFlatArray) {
					if (areAllCellsTypedArray) mergedGeometry.cells = typedArrayConcat(CellsConstructor, mergedGeometry.cells, new CellsConstructor(geometry.cells).map((n) => vertexOffset + n));
					else mergedGeometry.cells = mergedGeometry.cells.concat(geometry.cells.map((n) => vertexOffset + n));
				} else mergedGeometry.cells = mergedGeometry.cells.concat(isCellsFlatArray ? chunkAndOffset(geometry.cells, 3, vertexOffset) : geometry.cells.map((cell) => cell.map((n) => vertexOffset + n)));
			} else {
				mergedGeometry[attribute] ||= new geometry[attribute].constructor();
				const values = isAttributeFlat(geometry[attribute]) ? geometry[attribute] : geometry[attribute].flat();
				if (isAttributeTypedArray(mergedGeometry[attribute])) mergedGeometry[attribute] = typedArrayConcat(mergedGeometry[attribute].constructor, mergedGeometry[attribute], values);
				else mergedGeometry[attribute] = mergedGeometry[attribute].concat(values);
			}
		}
		vertexOffset += positionCount;
		delete geometry[meta];
	}
	return mergedGeometry;
}

export { merge as default };