/**
 * Kent County & Regional Qualifying Times (2026 Standards)
 * Extracted and converted to WA Points.
 */

const STANDARDS = {
  COUNTY: {
    F: {
      '50 Free': { ages: { 11: { pts: 307, time: '33.20' }, 12: { pts: 362, time: '31.40' }, 13: { pts: 400, time: '30.40' }, 14: { pts: 424, time: '29.80' }, 15: { pts: 433, time: '29.60' }, 16: { pts: 433, time: '29.60' }, 17: { pts: 460, time: '29.00' } } },
      '100 Free': { ages: { 11: { pts: 300, time: '1:12.50' }, 12: { pts: 371, time: '1:07.50' }, 13: { pts: 425, time: '1:04.50' }, 14: { pts: 445, time: '1:03.50' }, 15: { pts: 445, time: '1:03.50' }, 16: { pts: 445, time: '1:03.50' }, 17: { pts: 467, time: '1:02.50' } } },
      '200 Free': { ages: { 11: { pts: 298, time: '2:38.00' }, 12: { pts: 378, time: '2:26.00' }, 13: { pts: 419, time: '2:21.00' }, 14: { pts: 457, time: '2:17.00' }, 15: { pts: 477, time: '2:15.00' }, 16: { pts: 477, time: '2:15.00' }, 17: { pts: 511, time: '2:12.00' } } },
      '400 Free': { ages: { 11: { pts: 310, time: '5:35.00' }, 12: { pts: 367, time: '5:16.00' }, 13: { pts: 412, time: '5:04.00' }, 14: { pts: 452, time: '4:55.00' }, 15: { pts: 471, time: '4:51.00' }, 16: { pts: 471, time: '4:51.00' }, 17: { pts: 507, time: '4:44.00' } } },
      '800 Free': { ages: { 11: { pts: 315, time: '11:45.00' }, 12: { pts: 370, time: '11:05.00' }, 13: { pts: 415, time: '10:40.00' }, 14: { pts: 450, time: '10:25.00' }, 15: { pts: 470, time: '10:15.00' }, 16: { pts: 470, time: '10:15.00' }, 17: { pts: 500, time: '10:00.00' } } },
      '1500 Free': { ages: { 11: { pts: 315, time: '23:45.6' }, 12: { pts: 370, time: '20:35.8' }, 13: { pts: 415, time: '19:46.2' }, 14: { pts: 450, time: '19:08.0' }, 15: { pts: 470, time: '18:50.0' }, 16: { pts: 470, time: '18:50.0' }, 17: { pts: 500, time: '18:20.0' } } },
      '50 Back': { ages: { 11: { pts: 288, time: '39.00' }, 12: { pts: 348, time: '36.60' }, 13: { pts: 385, time: '35.40' }, 14: { pts: 419, time: '34.40' }, 15: { pts: 427, time: '34.20' }, 16: { pts: 427, time: '34.20' }, 17: { pts: 427, time: '34.20' } } },
      '100 Back': { ages: { 11: { pts: 279, time: '1:22.50' }, 12: { pts: 342, time: '1:17.00' }, 13: { pts: 378, time: '1:14.50' }, 14: { pts: 419, time: '1:12.00' }, 15: { pts: 419, time: '1:12.00' }, 16: { pts: 419, time: '1:12.00' }, 17: { pts: 428, time: '1:11.50' } } },
      '200 Back': { ages: { 11: { pts: 290, time: '2:55.00' }, 12: { pts: 345, time: '2:45.00' }, 13: { pts: 395, time: '2:38.00' }, 14: { pts: 434, time: '2:33.00' }, 15: { pts: 460, time: '2:30.00' }, 16: { pts: 460, time: '2:30.00' }, 17: { pts: 470, time: '2:28.00' } } },
      '50 Breast': { ages: { 11: { pts: 289, time: '44.20' }, 12: { pts: 361, time: '41.00' }, 13: { pts: 407, time: '39.40' }, 14: { pts: 446, time: '38.20' }, 15: { pts: 453, time: '38.00' }, 16: { pts: 453, time: '38.00' }, 17: { pts: 475, time: '37.40' } } },
      '100 Breast': { ages: { 11: { pts: 280, time: '1:39.00' }, 12: { pts: 355, time: '1:31.50' }, 13: { pts: 402, time: '1:27.50' }, 14: { pts: 440, time: '1:24.50' }, 15: { pts: 457, time: '1:23.50' }, 16: { pts: 457, time: '1:23.50' }, 17: { pts: 476, time: '1:22.50' } } },
      '200 Breast': { ages: { 11: { pts: 296, time: '3:30.00' }, 12: { pts: 348, time: '3:15.00' }, 13: { pts: 400, time: '3:05.00' }, 14: { pts: 439, time: '2:58.00' }, 15: { pts: 441, time: '2:55.00' }, 16: { pts: 490, time: '2:52.00' }, 17: { pts: 490, time: '2:52.00' } } },
      '50 Fly': { ages: { 11: { pts: 268, time: '37.60' }, 12: { pts: 311, time: '35.80' }, 13: { pts: 356, time: '34.20' }, 14: { pts: 396, time: '33.00' }, 15: { pts: 411, time: '32.60' }, 16: { pts: 411, time: '32.60' }, 17: { pts: 443, time: '31.80' } } },
      '100 Fly': { ages: { 11: { pts: 254, time: '1:28.00' }, 12: { pts: 324, time: '1:21.00' }, 13: { pts: 382, time: '1:16.50' }, 14: { pts: 420, time: '1:14.00' }, 15: { pts: 439, time: '1:13.00' }, 16: { pts: 439, time: '1:13.00' }, 17: { pts: 472, time: '1:11.00' } } },
      '200 Fly': { ages: { 11: { pts: 232, time: '3:15.00' }, 12: { pts: 311, time: '2:55.00' }, 13: { pts: 380, time: '2:45.00' }, 14: { pts: 409, time: '2:40.00' }, 15: { pts: 489, time: '2:32.00' }, 16: { pts: 489, time: '2:32.00' }, 17: { pts: 489, time: '2:32.00' } } },
      '100 IM': { ages: { 11: { pts: 280, time: '1:24.00' }, 12: { pts: 330, time: '1:18.00' }, 13: { pts: 380, time: '1:14.50' }, 14: { pts: 410, time: '1:12.00' }, 15: { pts: 430, time: '1:11.00' }, 16: { pts: 430, time: '1:11.00' }, 17: { pts: 450, time: '1:09.50' } } },
      '200 IM': { ages: { 11: { pts: 298, time: '2:59.00' }, 12: { pts: 380, time: '2:45.00' }, 13: { pts: 413, time: '2:40.50' }, 14: { pts: 456, time: '2:35.30' }, 15: { pts: 481, time: '2:32.60' }, 16: { pts: 481, time: '2:32.60' }, 17: { pts: 504, time: '2:30.20' } } },
      '400 IM': { ages: { 11: { pts: 300, time: '6:15.00' }, 12: { pts: 380, time: '5:50.00' }, 13: { pts: 415, time: '5:40.00' }, 14: { pts: 455, time: '5:30.00' }, 15: { pts: 480, time: '5:24.00' }, 16: { pts: 480, time: '5:24.00' }, 17: { pts: 505, time: '5:18.00' } } }
    },
    M: {
      '50 Free': { ages: { 11: { pts: 226, time: '33.20' }, 12: { pts: 267, time: '31.40' }, 13: { pts: 295, time: '30.40' }, 14: { pts: 313, time: '29.80' }, 15: { pts: 320, time: '29.60' }, 16: { pts: 320, time: '29.60' }, 17: { pts: 326, time: '29.00' } } },
      '100 Free': { ages: { 11: { pts: 216, time: '1:12.50' }, 12: { pts: 267, time: '1:07.50' }, 13: { pts: 305, time: '1:04.50' }, 14: { pts: 328, time: '1:03.50' }, 15: { pts: 328, time: '1:03.50' }, 16: { pts: 328, time: '1:03.50' }, 17: { pts: 344, time: '1:02.50' } } },
      '200 Free': { ages: { 11: { pts: 221, time: '2:38.00' }, 12: { pts: 281, time: '2:26.00' }, 13: { pts: 313, time: '2:21.00' }, 14: { pts: 341, time: '2:17.00' }, 15: { pts: 356, time: '2:15.00' }, 16: { pts: 356, time: '2:15.00' }, 17: { pts: 381, time: '2:12.00' } } },
      '400 Free': { ages: { 11: { pts: 225, time: '5:35.00' }, 12: { pts: 279, time: '5:16.00' }, 13: { pts: 314, time: '5:04.00' }, 14: { pts: 347, time: '4:55.00' }, 15: { pts: 362, time: '4:51.00' }, 16: { pts: 362, time: '4:51.00' }, 17: { pts: 385, time: '4:44.00' } } },
      '800 Free': { ages: { 11: { pts: 217, time: '11:40.0' }, 12: { pts: 235, time: '11:10.0' }, 13: { pts: 252, time: '10:45.0' }, 14: { pts: 271, time: '10:20.0' }, 15: { pts: 285, time: '10:05.0' }, 16: { pts: 285, time: '10:05.0' }, 17: { pts: 299, time: '9:50.0' } } },
      '1500 Free': { ages: { 11: { pts: 226, time: '21:49.3' }, 12: { pts: 232, time: '21:30.7' }, 13: { pts: 251, time: '20:13.1' }, 14: { pts: 304, time: '18:55.2' }, 15: { pts: 345, time: '18:09.7' }, 16: { pts: 345, time: '18:09.7' }, 17: { pts: 364, time: '17:50.1' } } },
      '50 Back': { ages: { 11: { pts: 202, time: '39.00' }, 12: { pts: 252, time: '36.60' }, 13: { pts: 306, time: '35.40' }, 14: { pts: 357, time: '34.40' }, 15: { pts: 396, time: '34.20' }, 16: { pts: 405, time: '34.20' }, 17: { pts: 422, time: '34.20' } } },
      '100 Back': { ages: { 11: { pts: 198, time: '1:22.50' }, 12: { pts: 254, time: '1:17.00' }, 13: { pts: 305, time: '1:14.50' }, 14: { pts: 355, time: '1:12.00' }, 15: { pts: 385, time: '1:12.00' }, 16: { pts: 393, time: '1:12.00' }, 17: { pts: 410, time: '1:11.50' } } },
      '200 Back': { ages: { 11: { pts: 196, time: '3:02.0' }, 12: { pts: 241, time: '2:50.0' }, 13: { pts: 278, time: '2:42.0' }, 14: { pts: 317, time: '2:35.0' }, 15: { pts: 364, time: '2:28.0' }, 16: { pts: 364, time: '2:28.0' }, 17: { pts: 364, time: '2:28.0' } } },
      '50 Breast': { ages: { 11: { pts: 174, time: '44.20' }, 12: { pts: 218, time: '41.00' }, 13: { pts: 275, time: '39.40' }, 14: { pts: 332, time: '38.20' }, 15: { pts: 343, time: '38.00' }, 16: { pts: 360, time: '38.00' }, 17: { pts: 372, time: '37.40' } } },
      '100 Breast': { ages: { 11: { pts: 171, time: '1:39.00' }, 12: { pts: 216, time: '1:31.50' }, 13: { pts: 275, time: '1:27.50' }, 14: { pts: 336, time: '1:24.50' }, 15: { pts: 350, time: '1:23.50' }, 16: { pts: 371, time: '1:23.50' }, 17: { pts: 395, time: '1:22.50' } } },
      '200 Breast': { ages: { 11: { pts: 173, time: '3:35.0' }, 12: { pts: 203, time: '3:18.0' }, 13: { pts: 249, time: '3:05.0' }, 14: { pts: 290, time: '2:56.0' }, 15: { pts: 321, time: '2:50.0' }, 16: { pts: 321, time: '2:50.0' }, 17: { pts: 321, time: '2:50.0' } } },
      '50 Fly': { ages: { 11: { pts: 181, time: '39.00' }, 12: { pts: 222, time: '36.40' }, 13: { pts: 282, time: '33.60' }, 14: { pts: 345, time: '31.40' }, 15: { pts: 396, time: '30.00' }, 16: { pts: 404, time: '29.80' }, 17: { pts: 420, time: '29.40' } } },
      '100 Fly': { ages: { 11: { pts: 149, time: '1:30.0' }, 12: { pts: 198, time: '1:22.0' }, 13: { pts: 248, time: '1:16.0' }, 14: { pts: 317, time: '1:10.0' }, 15: { pts: 346, time: '1:08.0' }, 16: { pts: 346, time: '1:08.0' }, 17: { pts: 346, time: '1:08.0' } } },
      '200 Fly': { ages: { 11: { pts: 134, time: '3:20.0' }, 12: { pts: 183, time: '3:00.0' }, 13: { pts: 217, time: '2:50.0' }, 14: { pts: 261, time: '2:40.0' }, 15: { pts: 304, time: '2:32.0' }, 16: { pts: 304, time: '2:32.0' }, 17: { pts: 304, time: '2:32.0' } } },
      '100 IM': { ages: { 11: { pts: 170, time: '1:30.0' }, 12: { pts: 220, time: '1:22.0' }, 13: { pts: 260, time: '1:18.0' }, 14: { pts: 300, time: '1:14.0' }, 15: { pts: 340, time: '1:11.0' }, 16: { pts: 340, time: '1:11.0' }, 17: { pts: 370, time: '1:09.0' } } },
      '200 IM': { ages: { 11: { pts: 199, time: '2:59.00' }, 12: { pts: 249, time: '2:45.00' }, 13: { pts: 310, time: '2:40.50' }, 14: { pts: 370, time: '2:35.30' }, 15: { pts: 394, time: '2:32.60' }, 16: { pts: 410, time: '2:32.60' }, 17: { pts: 468, time: '2:30.20' } } },
      '400 IM': { ages: { 11: { pts: 202, time: '6:20.0' }, 12: { pts: 247, time: '5:55.0' }, 13: { pts: 270, time: '5:45.0' }, 14: { pts: 308, time: '5:30.0' }, 15: { pts: 337, time: '5:20.0' }, 16: { pts: 337, time: '5:20.0' }, 17: { pts: 337, time: '5:20.0' } } }
    }
  },
  REGIONAL: {
    F: {
      '50 Free': { ages: { 12: { pts: 437, time: '30.20' }, 13: { pts: 464, time: '29.60' }, 14: { pts: 494, time: '29.00' }, 15: { pts: 520, time: '28.50' }, 16: { pts: 537, time: '28.20' }, 17: { pts: 555, time: '27.90' } } },
      '100 Free': { ages: { 12: { pts: 445, time: '1:05.80' }, 13: { pts: 479, time: '1:04.20' }, 14: { pts: 507, time: '1:03.00' }, 15: { pts: 537, time: '1:01.80' }, 16: { pts: 559, time: '1:01.00' }, 17: { pts: 581, time: '1:00.20' } } },
      '200 Free': { ages: { 12: { pts: 468, time: '2:22.00' }, 13: { pts: 505, time: '2:18.50' }, 14: { pts: 535, time: '2:15.80' }, 15: { pts: 567, time: '2:13.20' }, 16: { pts: 590, time: '2:11.50' }, 17: { pts: 610, time: '2:10.00' } } },
      '400 Free': { ages: { 12: { pts: 467, time: '4:58.00' }, 13: { pts: 497, time: '4:52.00' }, 14: { pts: 523, time: '4:47.00' }, 15: { pts: 551, time: '4:42.00' }, 16: { pts: 569, time: '4:39.00' }, 17: { pts: 588, time: '4:36.00' } } },
      '800 Free': { ages: { 12: { pts: 456, time: '10:20.00' }, 13: { pts: 491, time: '10:05.00' }, 14: { pts: 516, time: '9:55.00' }, 15: { pts: 543, time: '9:45.00' }, 16: { pts: 563, time: '9:38.00' }, 17: { pts: 581, time: '9:32.00' } } },
      '1500 Free': { ages: { 12: { pts: 450, time: '19:45.00' }, 13: { pts: 486, time: '19:15.00' }, 14: { pts: 512, time: '18:55.00' }, 15: { pts: 540, time: '18:35.00' }, 16: { pts: 562, time: '18:20.00' }, 17: { pts: 586, time: '18:05.00' } } },
      '50 Back': { ages: { 12: { pts: 381, time: '34.80' }, 13: { pts: 413, time: '33.90' }, 14: { pts: 439, time: '33.20' }, 15: { pts: 468, time: '32.50' }, 16: { pts: 486, time: '32.10' }, 17: { pts: 505, time: '31.70' } } },
      '100 Back': { ages: { 12: { pts: 384, time: '1:15.50' }, 13: { pts: 421, time: '1:13.20' }, 14: { pts: 446, time: '1:11.80' }, 15: { pts: 492, time: '1:09.50' }, 16: { pts: 514, time: '1:08.50' }, 17: { pts: 530, time: '1:07.80' } } },
      '200 Back': { ages: { 12: { pts: 395, time: '2:42.00' }, 13: { pts: 426, time: '2:38.00' }, 14: { pts: 460, time: '2:34.00' }, 15: { pts: 488, time: '2:31.00' }, 16: { pts: 508, time: '2:29.00' }, 17: { pts: 524, time: '2:27.50' } } },
      '50 Breast': { ages: { 12: { pts: 379, time: '39.20' }, 13: { pts: 403, time: '38.40' }, 14: { pts: 429, time: '37.60' }, 15: { pts: 468, time: '36.80' }, 16: { pts: 473, time: '36.40' }, 17: { pts: 489, time: '36.00' } } },
      '100 Breast': { ages: { 12: { pts: 374, time: '1:26.50' }, 13: { pts: 416, time: '1:23.50' }, 14: { pts: 456, time: '1:21.00' }, 15: { pts: 482, time: '1:19.50' }, 16: { pts: 501, time: '1:18.50' }, 17: { pts: 520, time: '1:17.50' } } },
      '200 Breast': { ages: { 12: { pts: 384, time: '3:05.00' }, 13: { pts: 432, time: '2:58.00' }, 14: { pts: 462, time: '2:54.00' }, 15: { pts: 496, time: '2:50.00' }, 16: { pts: 513, time: '2:48.00' }, 17: { pts: 532, time: '2:46.00' } } },
      '50 Fly': { ages: { 12: { pts: 395, time: '33.20' }, 13: { pts: 426, time: '32.40' }, 14: { pts: 454, time: '31.70' }, 15: { pts: 481, time: '31.10' }, 16: { pts: 500, time: '30.70' }, 17: { pts: 520, time: '30.30' } } },
      '100 Fly': { ages: { 12: { pts: 374, time: '1:15.00' }, 13: { pts: 414, time: '1:12.50' }, 14: { pts: 450, time: '1:10.50' }, 15: { pts: 491, time: '1:08.50' }, 16: { pts: 513, time: '1:07.50' }, 17: { pts: 529, time: '1:06.80' } } },
      '200 Fly': { ages: { 12: { pts: 380, time: '2:45.00' }, 13: { pts: 417, time: '2:40.00' }, 14: { pts: 459, time: '2:35.00' }, 15: { pts: 497, time: '2:31.00' }, 16: { pts: 517, time: '2:29.00' }, 17: { pts: 533, time: '2:27.50' } } },
      '200 IM': { ages: { 12: { pts: 445, time: '2:39.50' }, 13: { pts: 478, time: '2:35.80' }, 14: { pts: 511, time: '2:32.40' }, 15: { pts: 544, time: '2:29.20' }, 16: { pts: 563, time: '2:27.50' }, 17: { pts: 583, time: '2:25.80' } } },
      '400 IM': { ages: { 12: { pts: 422, time: '5:45.00' }, 13: { pts: 461, time: '5:35.00' }, 14: { pts: 492, time: '5:28.00' }, 15: { pts: 529, time: '5:20.00' }, 16: { pts: 550, time: '5:16.00' }, 17: { pts: 571, time: '5:12.00' } } }
    },
    M: {
      '50 Free': { ages: { 12: { pts: 309, time: '29.80' }, 13: { pts: 342, time: '28.80' }, 14: { pts: 377, time: '27.90' }, 15: { pts: 411, time: '27.10' }, 16: { pts: 440, time: '26.50' }, 17: { pts: 466, time: '26.00' } } },
      '100 Free': { ages: { 12: { pts: 328, time: '1:05.00' }, 13: { pts: 364, time: '1:02.80' }, 14: { pts: 401, time: '1:00.80' }, 15: { pts: 436, time: '59.10' }, 16: { pts: 464, time: '57.90' }, 17: { pts: 491, time: '56.80' } } },
      '200 Free': { ages: { 12: { pts: 346, time: '2:21.50' }, 13: { pts: 383, time: '2:16.80' }, 14: { pts: 420, time: '2:12.60' }, 15: { pts: 459, time: '2:08.80' }, 16: { pts: 488, time: '2:06.20' }, 17: { pts: 514, time: '2:04.00' } } },
      '400 Free': { ages: { 12: { pts: 361, time: '4:58.00' }, 13: { pts: 396, time: '4:49.00' }, 14: { pts: 430, time: '4:41.00' }, 15: { pts: 467, time: '4:33.50' }, 16: { pts: 496, time: '4:28.00' }, 17: { pts: 525, time: '4:23.00' } } },
      '800 Free': { ages: { 12: { pts: 350, time: '10:25.00' }, 13: { pts: 380, time: '10:08.00' }, 14: { pts: 416, time: '9:50.00' }, 15: { pts: 461, time: '9:30.00' }, 16: { pts: 499, time: '9:15.00' }, 17: { pts: 527, time: '9:05.00' } } },
      '1500 Free': { ages: { 12: { pts: 360, time: '19:50.00' }, 13: { pts: 399, time: '19:10.00' }, 14: { pts: 432, time: '18:40.00' }, 15: { pts: 469, time: '18:10.00' }, 16: { pts: 502, time: '17:45.00' }, 17: { pts: 532, time: '17:25.00' } } },
      '50 Back': { ages: { 12: { pts: 279, time: '33.80' }, 13: { pts: 311, time: '32.60' }, 14: { pts: 345, time: '31.50' }, 15: { pts: 377, time: '30.60' }, 16: { pts: 400, time: '30.00' }, 17: { pts: 425, time: '29.40' } } },
      '100 Back': { ages: { 12: { pts: 284, time: '1:13.50' }, 13: { pts: 318, time: '1:10.80' }, 14: { pts: 351, time: '1:08.50' }, 15: { pts: 389, time: '1:06.20' }, 16: { pts: 414, time: '1:04.80' }, 17: { pts: 440, time: '1:03.50' } } },
      '200 Back': { ages: { 12: { pts: 298, time: '2:38.00' }, 13: { pts: 329, time: '2:33.00' }, 14: { pts: 359, time: '2:28.50' }, 15: { pts: 394, time: '2:24.00' }, 16: { pts: 420, time: '2:21.00' }, 17: { pts: 443, time: '2:18.50' } } },
      '50 Breast': { ages: { 12: { pts: 278, time: '38.20' }, 13: { pts: 311, time: '36.80' }, 14: { pts: 347, time: '35.50' }, 15: { pts: 381, time: '34.40' }, 16: { pts: 409, time: '33.60' }, 17: { pts: 436, time: '32.90' } } },
      '100 Breast': { ages: { 12: { pts: 279, time: '1:24.50' }, 13: { pts: 315, time: '1:21.20' }, 14: { pts: 350, time: '1:18.40' }, 15: { pts: 387, time: '1:15.80' }, 16: { pts: 413, time: '1:14.20' }, 17: { pts: 437, time: '1:12.80' } } },
      '200 Breast': { ages: { 12: { pts: 278, time: '3:04.00' }, 13: { pts: 315, time: '2:56.50' }, 14: { pts: 348, time: '2:50.80' }, 15: { pts: 383, time: '2:45.50' }, 16: { pts: 408, time: '2:42.00' }, 17: { pts: 431, time: '2:39.00' } } },
      '50 Fly': { ages: { 12: { pts: 301, time: '32.40' }, 13: { pts: 337, time: '31.20' }, 14: { pts: 375, time: '30.10' }, 15: { pts: 411, time: '29.20' }, 16: { pts: 437, time: '28.60' }, 17: { pts: 466, time: '28.00' } } },
      '100 Fly': { ages: { 12: { pts: 288, time: '1:12.50' }, 13: { pts: 320, time: '1:10.00' }, 14: { pts: 353, time: '1:07.80' }, 15: { pts: 391, time: '1:05.50' }, 16: { pts: 416, time: '1:04.20' }, 17: { pts: 440, time: '1:03.00' } } },
      '200 Fly': { ages: { 12: { pts: 295, time: '2:42.00' }, 13: { pts: 327, time: '2:36.50' }, 14: { pts: 362, time: '2:31.20' }, 15: { pts: 395, time: '2:27.00' }, 16: { pts: 415, time: '2:24.50' }, 17: { pts: 438, time: '2:22.00' } } },
      '200 IM': { ages: { 12: { pts: 390, time: '2:38.50' }, 13: { pts: 430, time: '2:33.20' }, 14: { pts: 470, time: '2:28.50' }, 15: { pts: 510, time: '2:24.20' }, 16: { pts: 540, time: '2:21.00' }, 17: { pts: 570, time: '2:18.20' } } },
      '400 IM': { ages: { 12: { pts: 366, time: '5:42.00' }, 13: { pts: 400, time: '5:32.00' }, 14: { pts: 430, time: '5:24.00' }, 15: { pts: 466, time: '5:15.50' }, 16: { pts: 489, time: '5:09.00' }, 17: { pts: 514, time: '5:04.00' } } }
    }
  }
};

/**
 * Returns the Kent County AQT (Automatic Qualifying Time) benchmark in WA Points.
 */
export function getKentBenchmark(age, gender, event, level = 'COUNTY') {
  if (!age || age < 10) return 250;
  const lookupAge = Math.min(Math.max(age, 11), 17);
  const g = gender === 'M' || gender === 'Male' ? 'M' : 'F';
  const l = level.toUpperCase();
  
  const eventData = STANDARDS[l]?.[g]?.[event];
  if (eventData) {
    const ageData = eventData.ages[lookupAge] || eventData.ages[17] || eventData.ages[12] || eventData.ages[11];
    return ageData.pts;
  }

  // Fallback to average benchmark if event not found
  const fallbacks = {
    M: { 11: 200, 12: 250, 13: 300, 14: 340, 15: 360, 16: 380, 17: 400 },
    F: { 11: 280, 12: 340, 13: 390, 14: 430, 15: 450, 16: 460, 17: 480 }
  };
  return fallbacks[g][lookupAge] || fallbacks[g][17];
}

/**
 * Returns the average benchmark (WA Points) for a category of strokes.
 */
export function getCategoryBenchmark(age, gender, stroke, level = 'COUNTY') {
  if (!age || age < 10) return 250;
  const lookupAge = Math.min(Math.max(age, 11), 17);
  const g = gender === 'M' || gender === 'Male' ? 'M' : 'F';
  const l = level.toUpperCase();
  
  const standardSet = STANDARDS[l]?.[g];
  if (!standardSet) return 300;

  let totalPts = 0;
  let count = 0;

  // Map category keywords to event names
  const categoryMap = {
    'Free': 'Free',
    'Freestyle': 'Free',
    'Back': 'Back',
    'Backstroke': 'Back',
    'Breast': 'Breast',
    'Breaststroke': 'Breast',
    'Fly': 'Fly',
    'Butterfly': 'Fly',
    'IM': 'IM',
    'Individual Medley': 'IM',
    'Medley': 'IM'
  };
  const keyword = categoryMap[stroke] || stroke;

  Object.entries(standardSet).forEach(([eventName, data]) => {
    // Case-insensitive check for keyword match
    if (eventName.toLowerCase().includes(keyword.toLowerCase())) {
      const ageData = data.ages[lookupAge] || data.ages[17] || data.ages[12] || data.ages[11];
      if (ageData) {
        totalPts += ageData.pts;
        count++;
      }
    }
  });

  if (count > 0) return Math.round(totalPts / count);

  // Fallback to specific stroke benchmark if averaging fails
  const representative = { 'Free': '50 Free', 'Back': '50 Back', 'Breast': '50 Breast', 'Fly': '50 Fly', 'IM': '200 IM' };
  return getKentBenchmark(age, gender, representative[stroke] || '50 Free', level);
}

/**
 * Returns a table of benchmarks for a specific gender and level.
 */
export function getBenchmarkTable(gender, level = 'COUNTY') {
  const g = gender === 'M' || gender === 'Male' ? 'M' : 'F';
  const l = level.toUpperCase();
  const table = [];
  
  const standardSet = STANDARDS[l]?.[g];
  if (!standardSet) return [];
  
  const events = Object.keys(standardSet);
  const ages = [11, 12, 13, 14, 15, 16, 17];

  events.forEach(event => {
    const row = { event };
    ages.forEach(age => {
      const data = standardSet[event].ages[age];
      row[`age${age}`] = data ? data : null;
    });
    table.push(row);
  });
  return table;
}

export { STANDARDS };
