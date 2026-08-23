export interface Airport {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  region: "Australia" | "Europe" | "Asia";
  latitude: number;
  longitude: number;
}

type AirportCoordinates = Pick<Airport, "latitude" | "longitude">;

// Airport coordinates are kept beside the selectable-airport catalogue so all
// supported routes use the same source of truth for geographic calculations.
const AIRPORT_COORDINATES: Record<string, AirportCoordinates> = {
  AAL: { latitude: 57.094763, longitude: 9.84993 }, ADL: { latitude: -34.947512, longitude: 138.533393 }, AGP: { latitude: 36.6749, longitude: -4.49911 }, ALC: { latitude: 38.2822, longitude: -0.558156 }, AMS: { latitude: 52.308601, longitude: 4.76389 }, ARN: { latitude: 59.64849, longitude: 17.928829 }, ATH: { latitude: 37.936401, longitude: 23.9445 }, AVV: { latitude: -38.040269, longitude: 144.467196 }, AYT: { latitude: 36.898701, longitude: 30.800501 }, BCN: { latitude: 41.2971, longitude: 2.07846 }, BEG: { latitude: 44.818401, longitude: 20.309099 }, BER: { latitude: 52.361738, longitude: 13.502341 }, BGO: { latitude: 60.2934, longitude: 5.21814 }, BHD: { latitude: 54.618099, longitude: -5.8725 }, BIO: { latitude: 43.301102, longitude: -2.91061 }, BKK: { latitude: 13.6811, longitude: 100.747002 }, BLL: { latitude: 55.740335, longitude: 9.157019 }, BLQ: { latitude: 44.5354, longitude: 11.2887 }, BNE: { latitude: -27.384199142456055, longitude: 153.11700439453125 }, BOD: { latitude: 44.82865, longitude: -0.715356 }, BOJ: { latitude: 42.569917, longitude: 27.515173 }, BRS: { latitude: 51.382326, longitude: -2.716453 }, BRU: { latitude: 50.901402, longitude: 4.48444 }, BSL: { latitude: 47.60068, longitude: 7.521117 }, BUD: { latitude: 47.43018, longitude: 19.262393 }, CBR: { latitude: -35.3069, longitude: 149.195007 }, CDG: { latitude: 49.00896, longitude: 2.554117 }, CFU: { latitude: 39.60145, longitude: 19.912179 }, CGN: { latitude: 50.865898, longitude: 7.14274 }, CLJ: { latitude: 46.786042, longitude: 23.685733 }, CNS: { latitude: -16.878921, longitude: 145.74948 }, CPH: { latitude: 55.617900848389, longitude: 12.656000137329 }, CRL: { latitude: 50.461963, longitude: 4.459562 }, CTA: { latitude: 37.466801, longitude: 15.0664 }, DBV: { latitude: 42.562247, longitude: 18.265543 }, DPS: { latitude: -8.748409, longitude: 115.167123 }, DRW: { latitude: -12.41497, longitude: 130.88185 }, DUB: { latitude: 53.428713, longitude: -6.262121 }, DUS: { latitude: 51.289501, longitude: 6.76678 }, EDI: { latitude: 55.950145, longitude: -3.372288 }, EIN: { latitude: 51.4500999451, longitude: 5.37452983856 }, ESB: { latitude: 40.128101, longitude: 32.995098 }, FAO: { latitude: 37.015909, longitude: -7.970939 }, FCO: { latitude: 41.804532, longitude: 12.251998 }, FNC: { latitude: 32.697812, longitude: -16.774613 }, FRA: { latitude: 50.026706, longitude: 8.55835 }, GDN: { latitude: 54.377602, longitude: 18.4662 }, GLA: { latitude: 55.871899, longitude: -4.43306 }, GOT: { latitude: 57.6628, longitude: 12.2798 }, GRZ: { latitude: 46.9911, longitude: 15.4396 }, GVA: { latitude: 46.238098, longitude: 6.10895 }, HAM: { latitude: 53.630402, longitude: 9.98823 }, HBA: { latitude: -42.837032, longitude: 147.513022 }, HEL: { latitude: 60.318363, longitude: 24.963341 }, HER: { latitude: 35.339699, longitude: 25.1803 }, IBZ: { latitude: 38.872898, longitude: 1.37312 }, INN: { latitude: 47.260201, longitude: 11.344 }, IST: { latitude: 41.274874, longitude: 28.732136 }, IZM: { latitude: 37.950699, longitude: 27.329 }, JTR: { latitude: 36.400045, longitude: 25.478638 }, KRK: { latitude: 50.077702, longitude: 19.7848 }, LCA: { latitude: 34.875099, longitude: 33.624901 }, LCY: { latitude: 51.505299, longitude: 0.055278 }, LGW: { latitude: 51.148744, longitude: -0.185739 }, LHR: { latitude: 51.470748, longitude: -0.459909 }, LIN: { latitude: 45.445099, longitude: 9.27674 }, LIS: { latitude: 38.7813, longitude: -9.13592 }, LST: { latitude: -41.544935, longitude: 147.210785 }, LTN: { latitude: 51.874699, longitude: -0.368333 }, LYS: { latitude: 45.725996, longitude: 5.090139 }, MAD: { latitude: 40.493407, longitude: -3.572249 }, MAN: { latitude: 53.349375, longitude: -2.279521 }, MCY: { latitude: -26.593324, longitude: 153.08319 }, MEL: { latitude: -37.670732, longitude: 144.837898 }, MMX: { latitude: 55.535564, longitude: 13.376327 }, MRS: { latitude: 43.438088, longitude: 5.2125 }, MUC: { latitude: 48.353802, longitude: 11.7861 }, MXP: { latitude: 45.6306, longitude: 8.72811 }, NAP: { latitude: 40.886002, longitude: 14.2908 }, NCE: { latitude: 43.658401, longitude: 7.21587 }, NCL: { latitude: 55.037958, longitude: -1.689577 }, NTL: { latitude: -32.796114, longitude: 151.835025 }, OOL: { latitude: -28.165962, longitude: 153.506641 }, OPO: { latitude: 41.2481002808, longitude: -8.68138980865 }, ORK: { latitude: 51.841301, longitude: -8.49111 }, ORY: { latitude: 48.729499, longitude: 2.358963 }, OSL: { latitude: 60.193901, longitude: 11.1004 }, OTP: { latitude: 44.571792, longitude: 26.103285 }, PER: { latitude: -31.94029998779297, longitude: 115.96700286865234 }, PFO: { latitude: 34.717999, longitude: 32.485699 }, PMI: { latitude: 39.551701, longitude: 2.73881 }, PRG: { latitude: 50.100874, longitude: 14.259911 }, PUY: { latitude: 44.893501, longitude: 13.9222 }, RIX: { latitude: 56.920752, longitude: 23.970711 }, RTM: { latitude: 51.956902, longitude: 4.43722 }, RVN: { latitude: 66.563327, longitude: 25.829751 }, SAW: { latitude: 40.898602, longitude: 29.3092 }, SKG: { latitude: 40.51928, longitude: 22.970009 }, SNN: { latitude: 52.702, longitude: -8.92482 }, SOF: { latitude: 42.696357, longitude: 23.417671 }, SPU: { latitude: 43.538898, longitude: 16.298 }, STN: { latitude: 51.884998, longitude: 0.235 }, STR: { latitude: 48.689899, longitude: 9.22196 }, SVQ: { latitude: 37.417999, longitude: -5.89311 }, SYD: { latitude: -33.946098, longitude: 151.177002 }, SZG: { latitude: 47.793301, longitude: 13.0043 }, TLL: { latitude: 59.413246, longitude: 24.83264 }, TLS: { latitude: 43.629101, longitude: 1.36382 }, TRD: { latitude: 63.457802, longitude: 10.924 }, TSV: { latitude: -19.252904, longitude: 146.766512 }, VAR: { latitude: 43.232101, longitude: 27.8251 }, VCE: { latitude: 45.505299, longitude: 12.3519 }, VIE: { latitude: 48.110298, longitude: 16.5697 }, VLC: { latitude: 39.489162, longitude: -0.480961 }, VNO: { latitude: 54.634102, longitude: 25.285801 }, WAW: { latitude: 52.165699, longitude: 20.9671 }, WRO: { latitude: 51.103719, longitude: 16.882096 }, ZAG: { latitude: 45.742901, longitude: 16.0688 }, ZRH: { latitude: 47.458056, longitude: 8.548056 },
};

// Curated commercial passenger airports for the first version.  Keep this list
// deliberately readable: countries and then cities are alphabetical.
const AIRPORTS_WITHOUT_COORDINATES: Array<Omit<Airport, "latitude" | "longitude">> = [
  // Australia
  { iataCode: "ADL", name: "Adelaide Airport", city: "Adelaide", country: "Australia", region: "Australia" },
  { iataCode: "AVV", name: "Avalon Airport", city: "Avalon", country: "Australia", region: "Australia" },
  { iataCode: "BNE", name: "Brisbane Airport", city: "Brisbane", country: "Australia", region: "Australia" },
  { iataCode: "CNS", name: "Cairns Airport", city: "Cairns", country: "Australia", region: "Australia" },
  { iataCode: "CBR", name: "Canberra Airport", city: "Canberra", country: "Australia", region: "Australia" },
  { iataCode: "DRW", name: "Darwin International Airport", city: "Darwin", country: "Australia", region: "Australia" },
  { iataCode: "HBA", name: "Hobart Airport", city: "Hobart", country: "Australia", region: "Australia" },
  { iataCode: "LST", name: "Launceston Airport", city: "Launceston", country: "Australia", region: "Australia" },
  { iataCode: "MCY", name: "Sunshine Coast Airport", city: "Maroochydore", country: "Australia", region: "Australia" },
  { iataCode: "MEL", name: "Melbourne Airport", city: "Melbourne", country: "Australia", region: "Australia" },
  { iataCode: "NTL", name: "Newcastle Airport", city: "Newcastle", country: "Australia", region: "Australia" },
  { iataCode: "OOL", name: "Gold Coast Airport", city: "Gold Coast", country: "Australia", region: "Australia" },
  { iataCode: "PER", name: "Perth Airport", city: "Perth", country: "Australia", region: "Australia" },
  { iataCode: "SYD", name: "Sydney Airport", city: "Sydney", country: "Australia", region: "Australia" },
  { iataCode: "TSV", name: "Townsville Airport", city: "Townsville", country: "Australia", region: "Australia" },

  // Indonesia
  { iataCode: "DPS", name: "I Gusti Ngurah Rai International Airport", city: "Denpasar", country: "Indonesia", region: "Asia" },

  // Thailand
  { iataCode: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok", country: "Thailand", region: "Asia" },

  // Austria
  { iataCode: "GRZ", name: "Graz Airport", city: "Graz", country: "Austria", region: "Europe" },
  { iataCode: "INN", name: "Innsbruck Airport", city: "Innsbruck", country: "Austria", region: "Europe" },
  { iataCode: "SZG", name: "Salzburg Airport", city: "Salzburg", country: "Austria", region: "Europe" },
  { iataCode: "VIE", name: "Vienna International Airport", city: "Vienna", country: "Austria", region: "Europe" },
  // Belgium
  { iataCode: "BRU", name: "Brussels Airport", city: "Brussels", country: "Belgium", region: "Europe" },
  { iataCode: "CRL", name: "Brussels South Charleroi Airport", city: "Charleroi", country: "Belgium", region: "Europe" },
  // Bulgaria
  { iataCode: "BOJ", name: "Burgas Airport", city: "Burgas", country: "Bulgaria", region: "Europe" },
  { iataCode: "SOF", name: "Sofia Airport", city: "Sofia", country: "Bulgaria", region: "Europe" },
  { iataCode: "VAR", name: "Varna Airport", city: "Varna", country: "Bulgaria", region: "Europe" },
  // Croatia
  { iataCode: "DBV", name: "Dubrovnik Airport", city: "Dubrovnik", country: "Croatia", region: "Europe" },
  { iataCode: "PUY", name: "Pula Airport", city: "Pula", country: "Croatia", region: "Europe" },
  { iataCode: "SPU", name: "Split Airport", city: "Split", country: "Croatia", region: "Europe" },
  { iataCode: "ZAG", name: "Zagreb Airport", city: "Zagreb", country: "Croatia", region: "Europe" },
  // Cyprus
  { iataCode: "LCA", name: "Larnaca International Airport", city: "Larnaca", country: "Cyprus", region: "Europe" },
  { iataCode: "PFO", name: "Paphos International Airport", city: "Paphos", country: "Cyprus", region: "Europe" },
  // Czechia
  { iataCode: "PRG", name: "Václav Havel Airport Prague", city: "Prague", country: "Czechia", region: "Europe" },
  // Denmark
  { iataCode: "AAL", name: "Aalborg Airport", city: "Aalborg", country: "Denmark", region: "Europe" },
  { iataCode: "BLL", name: "Billund Airport", city: "Billund", country: "Denmark", region: "Europe" },
  { iataCode: "CPH", name: "Copenhagen Airport", city: "Copenhagen", country: "Denmark", region: "Europe" },
  // Estonia
  { iataCode: "TLL", name: "Tallinn Airport", city: "Tallinn", country: "Estonia", region: "Europe" },
  // Finland
  { iataCode: "HEL", name: "Helsinki Airport", city: "Helsinki", country: "Finland", region: "Europe" },
  { iataCode: "RVN", name: "Rovaniemi Airport", city: "Rovaniemi", country: "Finland", region: "Europe" },
  // France
  { iataCode: "BOD", name: "Bordeaux Airport", city: "Bordeaux", country: "France", region: "Europe" },
  { iataCode: "LYS", name: "Lyon–Saint Exupéry Airport", city: "Lyon", country: "France", region: "Europe" },
  { iataCode: "MRS", name: "Marseille Provence Airport", city: "Marseille", country: "France", region: "Europe" },
  { iataCode: "NCE", name: "Nice Côte d’Azur Airport", city: "Nice", country: "France", region: "Europe" },
  { iataCode: "CDG", name: "Paris Charles de Gaulle Airport", city: "Paris", country: "France", region: "Europe" },
  { iataCode: "ORY", name: "Paris Orly Airport", city: "Paris", country: "France", region: "Europe" },
  { iataCode: "TLS", name: "Toulouse–Blagnac Airport", city: "Toulouse", country: "France", region: "Europe" },
  // Germany
  { iataCode: "BER", name: "Berlin Brandenburg Airport", city: "Berlin", country: "Germany", region: "Europe" },
  { iataCode: "CGN", name: "Cologne Bonn Airport", city: "Cologne", country: "Germany", region: "Europe" },
  { iataCode: "DUS", name: "Düsseldorf Airport", city: "Düsseldorf", country: "Germany", region: "Europe" },
  { iataCode: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", region: "Europe" },
  { iataCode: "HAM", name: "Hamburg Airport", city: "Hamburg", country: "Germany", region: "Europe" },
  { iataCode: "MUC", name: "Munich Airport", city: "Munich", country: "Germany", region: "Europe" },
  { iataCode: "STR", name: "Stuttgart Airport", city: "Stuttgart", country: "Germany", region: "Europe" },
  // Greece
  { iataCode: "ATH", name: "Athens International Airport", city: "Athens", country: "Greece", region: "Europe" },
  { iataCode: "CFU", name: "Corfu International Airport", city: "Corfu", country: "Greece", region: "Europe" },
  { iataCode: "HER", name: "Heraklion International Airport", city: "Heraklion", country: "Greece", region: "Europe" },
  { iataCode: "JTR", name: "Santorini Airport", city: "Santorini", country: "Greece", region: "Europe" },
  { iataCode: "SKG", name: "Thessaloniki Airport", city: "Thessaloniki", country: "Greece", region: "Europe" },
  // Hungary
  { iataCode: "BUD", name: "Budapest Ferenc Liszt International Airport", city: "Budapest", country: "Hungary", region: "Europe" },
  // Ireland
  { iataCode: "ORK", name: "Cork Airport", city: "Cork", country: "Ireland", region: "Europe" },
  { iataCode: "DUB", name: "Dublin Airport", city: "Dublin", country: "Ireland", region: "Europe" },
  { iataCode: "SNN", name: "Shannon Airport", city: "Shannon", country: "Ireland", region: "Europe" },
  // Italy
  { iataCode: "BLQ", name: "Bologna Guglielmo Marconi Airport", city: "Bologna", country: "Italy", region: "Europe" },
  { iataCode: "CTA", name: "Catania–Fontanarossa Airport", city: "Catania", country: "Italy", region: "Europe" },
  { iataCode: "MXP", name: "Milan Malpensa Airport", city: "Milan", country: "Italy", region: "Europe" },
  { iataCode: "LIN", name: "Milan Linate Airport", city: "Milan", country: "Italy", region: "Europe" },
  { iataCode: "NAP", name: "Naples International Airport", city: "Naples", country: "Italy", region: "Europe" },
  { iataCode: "FCO", name: "Rome Fiumicino Airport", city: "Rome", country: "Italy", region: "Europe" },
  { iataCode: "VCE", name: "Venice Marco Polo Airport", city: "Venice", country: "Italy", region: "Europe" },
  // Latvia
  { iataCode: "RIX", name: "Riga International Airport", city: "Riga", country: "Latvia", region: "Europe" },
  // Lithuania
  { iataCode: "VNO", name: "Vilnius Airport", city: "Vilnius", country: "Lithuania", region: "Europe" },
  // Netherlands
  { iataCode: "AMS", name: "Amsterdam Airport Schiphol", city: "Amsterdam", country: "Netherlands", region: "Europe" },
  { iataCode: "EIN", name: "Eindhoven Airport", city: "Eindhoven", country: "Netherlands", region: "Europe" },
  { iataCode: "RTM", name: "Rotterdam The Hague Airport", city: "Rotterdam", country: "Netherlands", region: "Europe" },
  // Norway
  { iataCode: "BGO", name: "Bergen Airport", city: "Bergen", country: "Norway", region: "Europe" },
  { iataCode: "OSL", name: "Oslo Airport", city: "Oslo", country: "Norway", region: "Europe" },
  { iataCode: "TRD", name: "Trondheim Airport", city: "Trondheim", country: "Norway", region: "Europe" },
  // Poland
  { iataCode: "GDN", name: "Gdańsk Lech Wałęsa Airport", city: "Gdańsk", country: "Poland", region: "Europe" },
  { iataCode: "KRK", name: "Kraków John Paul II International Airport", city: "Kraków", country: "Poland", region: "Europe" },
  { iataCode: "WAW", name: "Warsaw Chopin Airport", city: "Warsaw", country: "Poland", region: "Europe" },
  { iataCode: "WRO", name: "Wrocław Airport", city: "Wrocław", country: "Poland", region: "Europe" },
  // Portugal
  { iataCode: "FAO", name: "Faro Airport", city: "Faro", country: "Portugal", region: "Europe" },
  { iataCode: "FNC", name: "Madeira Airport", city: "Funchal", country: "Portugal", region: "Europe" },
  { iataCode: "LIS", name: "Humberto Delgado Airport", city: "Lisbon", country: "Portugal", region: "Europe" },
  { iataCode: "OPO", name: "Francisco Sá Carneiro Airport", city: "Porto", country: "Portugal", region: "Europe" },
  // Romania
  { iataCode: "OTP", name: "Henri Coandă International Airport", city: "Bucharest", country: "Romania", region: "Europe" },
  { iataCode: "CLJ", name: "Cluj Avram Iancu International Airport", city: "Cluj-Napoca", country: "Romania", region: "Europe" },
  // Serbia
  { iataCode: "BEG", name: "Belgrade Nikola Tesla Airport", city: "Belgrade", country: "Serbia", region: "Europe" },
  // Spain
  { iataCode: "ALC", name: "Alicante–Elche Airport", city: "Alicante", country: "Spain", region: "Europe" },
  { iataCode: "BCN", name: "Barcelona–El Prat Airport", city: "Barcelona", country: "Spain", region: "Europe" },
  { iataCode: "BIO", name: "Bilbao Airport", city: "Bilbao", country: "Spain", region: "Europe" },
  { iataCode: "IBZ", name: "Ibiza Airport", city: "Ibiza", country: "Spain", region: "Europe" },
  { iataCode: "MAD", name: "Adolfo Suárez Madrid–Barajas Airport", city: "Madrid", country: "Spain", region: "Europe" },
  { iataCode: "AGP", name: "Málaga Airport", city: "Málaga", country: "Spain", region: "Europe" },
  { iataCode: "PMI", name: "Palma de Mallorca Airport", city: "Palma", country: "Spain", region: "Europe" },
  { iataCode: "SVQ", name: "Seville Airport", city: "Seville", country: "Spain", region: "Europe" },
  { iataCode: "VLC", name: "Valencia Airport", city: "Valencia", country: "Spain", region: "Europe" },
  // Sweden
  { iataCode: "ARN", name: "Stockholm Arlanda Airport", city: "Stockholm", country: "Sweden", region: "Europe" },
  { iataCode: "GOT", name: "Göteborg Landvetter Airport", city: "Gothenburg", country: "Sweden", region: "Europe" },
  { iataCode: "MMX", name: "Malmö Airport", city: "Malmö", country: "Sweden", region: "Europe" },
  // Switzerland
  { iataCode: "BSL", name: "EuroAirport Basel Mulhouse Freiburg", city: "Basel", country: "Switzerland", region: "Europe" },
  { iataCode: "GVA", name: "Geneva Airport", city: "Geneva", country: "Switzerland", region: "Europe" },
  { iataCode: "ZRH", name: "Zurich Airport", city: "Zurich", country: "Switzerland", region: "Europe" },
  // Turkey
  { iataCode: "AYT", name: "Antalya Airport", city: "Antalya", country: "Turkey", region: "Europe" },
  { iataCode: "ESB", name: "Esenboğa Airport", city: "Ankara", country: "Turkey", region: "Europe" },
  { iataCode: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Turkey", region: "Europe" },
  { iataCode: "SAW", name: "Sabiha Gökçen International Airport", city: "Istanbul", country: "Turkey", region: "Europe" },
  { iataCode: "IZM", name: "Izmir Adnan Menderes Airport", city: "Izmir", country: "Turkey", region: "Europe" },
  // United Kingdom
  { iataCode: "BHD", name: "George Best Belfast City Airport", city: "Belfast", country: "United Kingdom", region: "Europe" },
  { iataCode: "BRS", name: "Bristol Airport", city: "Bristol", country: "United Kingdom", region: "Europe" },
  { iataCode: "EDI", name: "Edinburgh Airport", city: "Edinburgh", country: "United Kingdom", region: "Europe" },
  { iataCode: "GLA", name: "Glasgow Airport", city: "Glasgow", country: "United Kingdom", region: "Europe" },
  { iataCode: "LHR", name: "London Heathrow Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "LGW", name: "London Gatwick Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "LCY", name: "London City Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "LTN", name: "London Luton Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "STN", name: "London Stansted Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "MAN", name: "Manchester Airport", city: "Manchester", country: "United Kingdom", region: "Europe" },
  { iataCode: "NCL", name: "Newcastle International Airport", city: "Newcastle", country: "United Kingdom", region: "Europe" },
];

export const AIRPORTS: Airport[] = AIRPORTS_WITHOUT_COORDINATES.map(
  (airport) => {
    const coordinates = AIRPORT_COORDINATES[airport.iataCode];
    if (!coordinates) {
      throw new Error(`Missing coordinates for configured airport ${airport.iataCode}.`);
    }

    return { ...airport, ...coordinates };
  },
);

export function findAirportByCode(code: string): Airport | undefined {
  const normalisedCode = code.trim().toUpperCase();
  return AIRPORTS.find((airport) => airport.iataCode === normalisedCode);
}
