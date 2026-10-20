import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PropertyStatus } from '../types/prisma.types';
import { SearchPropertiesDto } from './dto/search-properties.dto';

/**
 * Translate a `SearchPropertiesDto` into a Prisma `where` clause.
 *
 * Extracted verbatim from `PropertiesService.searchProperties`, where it made
 * that method (and the 1200-line service) much harder to follow: filter building
 * is a pure function of its input, has no database access and no `this`, and is
 * now the only place that knows how a query filter maps to a column predicate.
 *
 * Behaviour is unchanged, including the deliberate quirks it preserves:
 *  - `bedrooms`/`bathrooms` exact filters win over the matching range filter,
 *  - the public search endpoint only ever exposes `ACTIVE` properties,
 *  - a radius search is approximated with a bounding box (1 degree of latitude
 *    is about 111 km), which is rejected unless `lat`/`lng` are supplied together.
 *
 * @throws BadRequestException when the geo parameters contradict each other.
 */
export function buildSearchWhereClause(dto: SearchPropertiesDto): Record<string, unknown> {
  const where: Record<string, unknown> = {
    deleted: false,
  };

  // Price range
  if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
    const priceFilter: Record<string, Decimal> = {};
    if (dto.minPrice !== undefined) {
      priceFilter.gte = new Decimal(dto.minPrice.toString());
    }
    if (dto.maxPrice !== undefined) {
      priceFilter.lte = new Decimal(dto.maxPrice.toString());
    }
    where.price = priceFilter;
  }

  // Location: granular fields (case-insensitive equality)
  if (dto.city) {
    where.city = { equals: dto.city, mode: 'insensitive' };
  }
  if (dto.state) {
    where.state = { equals: dto.state, mode: 'insensitive' };
  }
  if (dto.zipCode) {
    where.zipCode = dto.zipCode;
  }
  if (dto.country) {
    where.country = { equals: dto.country, mode: 'insensitive' };
  }

  // Location: free-text fallback (matches across address/city/state/zipCode)
  if (dto.location) {
    where.OR = [
      { address: { contains: dto.location, mode: 'insensitive' } },
      { city: { contains: dto.location, mode: 'insensitive' } },
      { state: { contains: dto.location, mode: 'insensitive' } },
      { zipCode: { contains: dto.location, mode: 'insensitive' } },
    ];
  }

  // Property type (case-insensitive)
  if (dto.propertyType) {
    where.propertyType = { equals: dto.propertyType, mode: 'insensitive' };
  }

  // Bedrooms: exact takes precedence over range
  if (dto.bedrooms !== undefined) {
    where.bedrooms = dto.bedrooms;
  } else if (dto.minBedrooms !== undefined || dto.maxBedrooms !== undefined) {
    const bedroomsFilter: Record<string, number> = {};
    if (dto.minBedrooms !== undefined) bedroomsFilter.gte = dto.minBedrooms;
    if (dto.maxBedrooms !== undefined) bedroomsFilter.lte = dto.maxBedrooms;
    where.bedrooms = bedroomsFilter;
  }

  // Bathrooms: stored as Decimal — wrap accordingly
  if (dto.bathrooms !== undefined) {
    where.bathrooms = new Decimal(dto.bathrooms.toString());
  } else if (dto.minBathrooms !== undefined || dto.maxBathrooms !== undefined) {
    const bathroomsFilter: Record<string, Decimal> = {};
    if (dto.minBathrooms !== undefined) {
      bathroomsFilter.gte = new Decimal(dto.minBathrooms.toString());
    }
    if (dto.maxBathrooms !== undefined) {
      bathroomsFilter.lte = new Decimal(dto.maxBathrooms.toString());
    }
    where.bathrooms = bathroomsFilter;
  }

  // Public search only exposes approved listings.
  // Any search from the public search endpoint must end up returning ACTIVE properties.
  where.status = PropertyStatus.ACTIVE;

  // Year built filter (#555)
  if (dto.minYearBuilt !== undefined || dto.maxYearBuilt !== undefined) {
    const yearFilter: Record<string, number> = {};
    if (dto.minYearBuilt !== undefined) yearFilter.gte = dto.minYearBuilt;
    if (dto.maxYearBuilt !== undefined) yearFilter.lte = dto.maxYearBuilt;
    where.yearBuilt = yearFilter;
  }

  // Metadata: category and tag
  if (dto.category) {
    where.category = { equals: dto.category, mode: 'insensitive' };
  }
  if (dto.tag) {
    where.tags = { has: dto.tag };
  }

  // Amenity type filter (via relation)
  if (dto.amenityType) {
    where.amenities = {
      some: { amenityType: { equals: dto.amenityType, mode: 'insensitive' } },
    };
  }

  // Geo: validate lat/lng usage
  const hasLat = dto.lat !== undefined;
  const hasLng = dto.lng !== undefined;
  if (hasLat !== hasLng) {
    throw new BadRequestException('Both lat and lng must be provided together');
  }

  const lat = dto.lat;
  const lng = dto.lng;
  if (lat === undefined || lng === undefined) {
    throw new BadRequestException('Both lat and lng must be provided together');
  }

  const hasBoundingBox =
    dto.minLat !== undefined ||
    dto.maxLat !== undefined ||
    dto.minLng !== undefined ||
    dto.maxLng !== undefined;

  if (lat !== undefined && lng !== undefined) {
    if (dto.radiusKm !== undefined) {
      // Approximate radius as bounding box (1 degree lat ≈ 111km)
      const latDelta = dto.radiusKm / 111;
      const lngDelta = dto.radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
      where.latitude = { gte: lat - latDelta, lte: lat + latDelta };
      where.longitude = { gte: lng - lngDelta, lte: lng + lngDelta };
    } else if (!hasBoundingBox) {
      throw new BadRequestException(
        'When providing lat/lng, either radiusKm or bounding box params (minLat/maxLat/minLng/maxLng) must also be provided',
      );
    }
  }

  // Bounding box filter
  if (hasBoundingBox) {
    const latFilter: Record<string, number> = {};
    const lngFilter: Record<string, number> = {};
    if (dto.minLat !== undefined) latFilter.gte = dto.minLat;
    if (dto.maxLat !== undefined) latFilter.lte = dto.maxLat;
    if (dto.minLng !== undefined) lngFilter.gte = dto.minLng;
    if (dto.maxLng !== undefined) lngFilter.lte = dto.maxLng;
    if (Object.keys(latFilter).length > 0) {
      where.latitude = {
        ...(where.latitude as Record<string, number> | undefined),
        ...latFilter,
      };
    }
    if (Object.keys(lngFilter).length > 0) {
      where.longitude = {
        ...(where.longitude as Record<string, number> | undefined),
        ...lngFilter,
      };
    }
  }

  return where;
}
