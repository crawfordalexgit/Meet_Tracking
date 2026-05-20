/**
 * Kent County & Regional Qualifying Times (2026 Standards)
 * Extracted and converted to WA Points.
 */

import { timeToSeconds } from './analytics-utils';

const STANDARDS = {
  "COUNTY": {
    "M": {
      "50 Free": {
        "ages": {
          "11": {
            "autoSC": "33.80",
            "consSC": "37.80",
            "autoLC": "34.40",
            "consLC": "38.40",
            "pts": 212
          },
          "12": {
            "autoSC": "31.80",
            "consSC": "34.80",
            "autoLC": "32.50",
            "consLC": "35.40",
            "pts": 254
          },
          "13": {
            "autoSC": "29.60",
            "consSC": "32.00",
            "autoLC": "30.30",
            "consLC": "32.60",
            "pts": 315
          },
          "14": {
            "autoSC": "28.00",
            "consSC": "30.00",
            "autoLC": "28.70",
            "consLC": "30.70",
            "pts": 373
          },
          "15": {
            "autoSC": "27.20",
            "consSC": "29.00",
            "autoLC": "28.00",
            "consLC": "29.70",
            "pts": 407
          },
          "16": {
            "autoSC": "26.60",
            "consSC": "28.60",
            "autoLC": "27.40",
            "consLC": "29.30",
            "pts": 435
          },
          "17": {
            "autoSC": "26.40",
            "consSC": "28.60",
            "autoLC": "27.20",
            "consLC": "29.30",
            "pts": 445
          }
        }
      },
      "100 Free": {
        "ages": {
          "11": {
            "autoSC": "1:13.50",
            "consSC": "1:26.00",
            "autoLC": "1:14.60",
            "consLC": "1:27.00",
            "pts": 227
          },
          "12": {
            "autoSC": "1:08.50",
            "consSC": "1:15.50",
            "autoLC": "1:09.70",
            "consLC": "1:16.60",
            "pts": 280
          },
          "13": {
            "autoSC": "1:03.50",
            "consSC": "1:09.50",
            "autoLC": "1:04.80",
            "consLC": "1:10.70",
            "pts": 352
          },
          "14": {
            "autoSC": "1:00.00",
            "consSC": "1:04.50",
            "autoLC": "1:01.40",
            "consLC": "1:05.80",
            "pts": 417
          },
          "15": {
            "autoSC": "58.00",
            "consSC": "1:02.00",
            "autoLC": "59.40",
            "consLC": "1:03.30",
            "pts": 462
          },
          "16": {
            "autoSC": "57.50",
            "consSC": "1:02.00",
            "autoLC": "58.90",
            "consLC": "1:03.30",
            "pts": 474
          },
          "17": {
            "autoSC": "55.50",
            "consSC": "1:00.00",
            "autoLC": "57.00",
            "consLC": "1:01.40",
            "pts": 527
          }
        }
      },
      "200 Free": {
        "ages": {
          "11": {
            "autoSC": "2:39.00",
            "consSC": "3:00.00",
            "autoLC": "2:41.20",
            "consLC": "3:01.90",
            "pts": 244
          },
          "12": {
            "autoSC": "2:28.00",
            "consSC": "2:43.00",
            "autoLC": "2:30.30",
            "consLC": "2:45.10",
            "pts": 302
          },
          "13": {
            "autoSC": "2:18.00",
            "consSC": "2:32.00",
            "autoLC": "2:20.50",
            "consLC": "2:34.30",
            "pts": 373
          },
          "14": {
            "autoSC": "2:11.00",
            "consSC": "2:21.00",
            "autoLC": "2:13.60",
            "consLC": "2:23.40",
            "pts": 436
          },
          "15": {
            "autoSC": "2:07.00",
            "consSC": "2:16.00",
            "autoLC": "2:09.70",
            "consLC": "2:18.50",
            "pts": 479
          },
          "16": {
            "autoSC": "2:07.00",
            "consSC": "2:16.00",
            "autoLC": "2:09.70",
            "consLC": "2:18.50",
            "pts": 479
          },
          "17": {
            "autoSC": "2:02.00",
            "consSC": "2:14.00",
            "autoLC": "2:04.80",
            "consLC": "2:16.60",
            "pts": 540
          }
        }
      },
      "400 Free": {
        "ages": {
          "11": {
            "autoSC": "5:40.00",
            "consSC": "6:28.00",
            "autoLC": "5:44.10",
            "consLC": "6:31.60",
            "pts": 243
          },
          "12": {
            "autoSC": "5:14.00",
            "consSC": "5:42.00",
            "autoLC": "5:18.40",
            "consLC": "5:46.10",
            "pts": 308
          },
          "13": {
            "autoSC": "4:56.00",
            "consSC": "5:18.00",
            "autoLC": "5:00.70",
            "consLC": "5:22.40",
            "pts": 368
          },
          "14": {
            "autoSC": "4:38.00",
            "consSC": "5:02.00",
            "autoLC": "4:43.00",
            "consLC": "5:06.60",
            "pts": 445
          },
          "15": {
            "autoSC": "4:30.00",
            "consSC": "4:50.00",
            "autoLC": "4:35.10",
            "consLC": "4:54.80",
            "pts": 485
          },
          "16": {
            "autoSC": "4:28.00",
            "consSC": "4:48.00",
            "autoLC": "4:33.20",
            "consLC": "4:52.80",
            "pts": 496
          },
          "17": {
            "autoSC": "4:20.00",
            "consSC": "4:46.00",
            "autoLC": "4:25.30",
            "consLC": "4:50.90",
            "pts": 544
          }
        }
      },
      "800 Free": {
        "ages": {
          "11": {
            "autoSC": "11:44.00",
            "consSC": "11:44.00",
            "autoLC": "11:52.20",
            "consLC": "11:52.20",
            "pts": 244
          },
          "12": {
            "autoSC": "11:44.00",
            "consSC": "11:44.00",
            "autoLC": "11:52.20",
            "consLC": "11:52.20",
            "pts": 244
          },
          "13": {
            "autoSC": "11:00.00",
            "consSC": "11:00.00",
            "autoLC": "11:08.70",
            "consLC": "11:08.70",
            "pts": 297
          },
          "14": {
            "autoSC": "10:28.00",
            "consSC": "10:28.00",
            "autoLC": "10:37.10",
            "consLC": "10:37.10",
            "pts": 345
          },
          "15": {
            "autoSC": "10:04.00",
            "consSC": "10:04.00",
            "autoLC": "10:13.50",
            "consLC": "10:13.50",
            "pts": 387
          },
          "16": {
            "autoSC": "9:56.00",
            "consSC": "9:56.00",
            "autoLC": "10:05.60",
            "consLC": "10:05.60",
            "pts": 403
          },
          "17": {
            "autoSC": "9:56.00",
            "consSC": "9:56.00",
            "autoLC": "10:05.60",
            "consLC": "10:05.60",
            "pts": 403
          }
        }
      },
      "1500 Free": {
        "ages": {
          "11": {
            "autoSC": "22:08.00",
            "consSC": "22:08.00",
            "autoLC": "22:23.50",
            "consLC": "22:23.50",
            "pts": 259
          },
          "12": {
            "autoSC": "22:08.00",
            "consSC": "22:08.00",
            "autoLC": "22:23.50",
            "consLC": "22:23.50",
            "pts": 259
          },
          "13": {
            "autoSC": "20:40.00",
            "consSC": "20:40.00",
            "autoLC": "20:56.60",
            "consLC": "20:56.60",
            "pts": 318
          },
          "14": {
            "autoSC": "20:00.00",
            "consSC": "20:00.00",
            "autoLC": "20:17.10",
            "consLC": "20:17.10",
            "pts": 351
          },
          "15": {
            "autoSC": "19:04.00",
            "consSC": "19:04.00",
            "autoLC": "19:21.90",
            "consLC": "19:21.90",
            "pts": 405
          },
          "16": {
            "autoSC": "18:52.00",
            "consSC": "18:52.00",
            "autoLC": "19:10.10",
            "consLC": "19:10.10",
            "pts": 418
          },
          "17": {
            "autoSC": "18:40.00",
            "consSC": "18:40.00",
            "autoLC": "18:58.30",
            "consLC": "18:58.30",
            "pts": 432
          }
        }
      },
      "50 Back": {
        "ages": {
          "11": {
            "autoSC": "40.00",
            "consSC": "44.40",
            "autoLC": "40.50",
            "consLC": "44.90",
            "pts": 168
          },
          "12": {
            "autoSC": "37.20",
            "consSC": "40.60",
            "autoLC": "37.70",
            "consLC": "41.10",
            "pts": 209
          },
          "13": {
            "autoSC": "34.60",
            "consSC": "37.80",
            "autoLC": "35.20",
            "consLC": "38.30",
            "pts": 260
          },
          "14": {
            "autoSC": "33.00",
            "consSC": "35.20",
            "autoLC": "33.60",
            "consLC": "35.80",
            "pts": 300
          },
          "15": {
            "autoSC": "32.20",
            "consSC": "34.40",
            "autoLC": "32.80",
            "consLC": "35.00",
            "pts": 323
          },
          "16": {
            "autoSC": "32.20",
            "consSC": "34.40",
            "autoLC": "32.80",
            "consLC": "35.00",
            "pts": 323
          },
          "17": {
            "autoSC": "32.00",
            "consSC": "34.40",
            "autoLC": "32.60",
            "consLC": "35.00",
            "pts": 329
          }
        }
      },
      "100 Back": {
        "ages": {
          "11": {
            "autoSC": "1:24.50",
            "consSC": "1:37.00",
            "autoLC": "1:25.40",
            "consLC": "1:37.80",
            "pts": 187
          },
          "12": {
            "autoSC": "1:19.00",
            "consSC": "1:27.00",
            "autoLC": "1:20.00",
            "consLC": "1:27.90",
            "pts": 228
          },
          "13": {
            "autoSC": "1:12.50",
            "consSC": "1:20.50",
            "autoLC": "1:13.60",
            "consLC": "1:21.50",
            "pts": 296
          },
          "14": {
            "autoSC": "1:10.00",
            "consSC": "1:15.00",
            "autoLC": "1:11.10",
            "consLC": "1:16.10",
            "pts": 329
          },
          "15": {
            "autoSC": "1:07.00",
            "consSC": "1:11.50",
            "autoLC": "1:08.20",
            "consLC": "1:12.60",
            "pts": 375
          },
          "16": {
            "autoSC": "1:06.50",
            "consSC": "1:11.50",
            "autoLC": "1:07.70",
            "consLC": "1:12.60",
            "pts": 383
          },
          "17": {
            "autoSC": "1:04.50",
            "consSC": "1:10.00",
            "autoLC": "1:05.70",
            "consLC": "1:11.10",
            "pts": 420
          }
        }
      },
      "200 Back": {
        "ages": {
          "11": {
            "autoSC": "2:59.00",
            "consSC": "3:21.00",
            "autoLC": "3:00.90",
            "consLC": "3:22.70",
            "pts": 205
          },
          "12": {
            "autoSC": "2:49.00",
            "consSC": "3:02.00",
            "autoLC": "2:51.00",
            "consLC": "3:03.80",
            "pts": 244
          },
          "13": {
            "autoSC": "2:36.00",
            "consSC": "2:52.00",
            "autoLC": "2:38.10",
            "consLC": "2:53.90",
            "pts": 310
          },
          "14": {
            "autoSC": "2:28.00",
            "consSC": "2:40.00",
            "autoLC": "2:30.20",
            "consLC": "2:42.10",
            "pts": 363
          },
          "15": {
            "autoSC": "2:23.00",
            "consSC": "2:33.00",
            "autoLC": "2:25.30",
            "consLC": "2:35.20",
            "pts": 403
          },
          "16": {
            "autoSC": "2:22.00",
            "consSC": "2:32.00",
            "autoLC": "2:24.30",
            "consLC": "2:34.20",
            "pts": 411
          },
          "17": {
            "autoSC": "2:20.00",
            "consSC": "2:32.00",
            "autoLC": "2:22.40",
            "consLC": "2:34.20",
            "pts": 429
          }
        }
      },
      "50 Breast": {
        "ages": {
          "11": {
            "autoSC": "46.00",
            "consSC": "51.60",
            "autoLC": "46.70",
            "consLC": "52.20",
            "pts": 159
          },
          "12": {
            "autoSC": "42.60",
            "consSC": "46.40",
            "autoLC": "43.30",
            "consLC": "47.10",
            "pts": 200
          },
          "13": {
            "autoSC": "39.40",
            "consSC": "43.40",
            "autoLC": "40.20",
            "consLC": "44.10",
            "pts": 253
          },
          "14": {
            "autoSC": "37.00",
            "consSC": "39.80",
            "autoLC": "37.80",
            "consLC": "40.60",
            "pts": 306
          },
          "15": {
            "autoSC": "36.40",
            "consSC": "38.80",
            "autoLC": "37.30",
            "consLC": "39.60",
            "pts": 322
          },
          "16": {
            "autoSC": "35.80",
            "consSC": "38.40",
            "autoLC": "36.70",
            "consLC": "39.20",
            "pts": 338
          },
          "17": {
            "autoSC": "35.00",
            "consSC": "37.80",
            "autoLC": "35.90",
            "consLC": "38.60",
            "pts": 362
          }
        }
      },
      "100 Breast": {
        "ages": {
          "11": {
            "autoSC": "1:39.00",
            "consSC": "1:54.50",
            "autoLC": "1:40.30",
            "consLC": "1:55.60",
            "pts": 174
          },
          "12": {
            "autoSC": "1:31.50",
            "consSC": "1:41.50",
            "autoLC": "1:32.90",
            "consLC": "1:42.70",
            "pts": 220
          },
          "13": {
            "autoSC": "1:24.50",
            "consSC": "1:33.00",
            "autoLC": "1:26.00",
            "consLC": "1:34.30",
            "pts": 279
          },
          "14": {
            "autoSC": "1:19.00",
            "consSC": "1:25.50",
            "autoLC": "1:20.60",
            "consLC": "1:27.00",
            "pts": 342
          },
          "15": {
            "autoSC": "1:18.00",
            "consSC": "1:23.50",
            "autoLC": "1:19.60",
            "consLC": "1:25.00",
            "pts": 355
          },
          "16": {
            "autoSC": "1:15.00",
            "consSC": "1:20.50",
            "autoLC": "1:16.70",
            "consLC": "1:22.10",
            "pts": 400
          },
          "17": {
            "autoSC": "1:13.50",
            "consSC": "1:19.50",
            "autoLC": "1:15.20",
            "consLC": "1:21.10",
            "pts": 425
          }
        }
      },
      "200 Breast": {
        "ages": {
          "11": {
            "autoSC": "3:31.00",
            "consSC": "3:55.00",
            "autoLC": "3:33.50",
            "consLC": "3:57.20",
            "pts": 184
          },
          "12": {
            "autoSC": "3:15.00",
            "consSC": "3:34.00",
            "autoLC": "3:17.70",
            "consLC": "3:36.50",
            "pts": 233
          },
          "13": {
            "autoSC": "3:01.00",
            "consSC": "3:17.00",
            "autoLC": "3:03.90",
            "consLC": "3:19.70",
            "pts": 292
          },
          "14": {
            "autoSC": "2:54.00",
            "consSC": "3:06.00",
            "autoLC": "2:57.00",
            "consLC": "3:08.80",
            "pts": 329
          },
          "15": {
            "autoSC": "2:51.00",
            "consSC": "3:03.00",
            "autoLC": "2:54.10",
            "consLC": "3:05.90",
            "pts": 346
          },
          "16": {
            "autoSC": "2:43.00",
            "consSC": "2:55.00",
            "autoLC": "2:46.20",
            "consLC": "2:58.00",
            "pts": 400
          },
          "17": {
            "autoSC": "2:37.00",
            "consSC": "2:53.00",
            "autoLC": "2:40.30",
            "consLC": "2:56.00",
            "pts": 448
          }
        }
      },
      "50 Fly": {
        "ages": {
          "11": {
            "autoSC": "39.00",
            "consSC": "44.20",
            "autoLC": "39.50",
            "consLC": "44.60",
            "pts": 173
          },
          "12": {
            "autoSC": "36.40",
            "consSC": "39.80",
            "autoLC": "36.90",
            "consLC": "40.30",
            "pts": 213
          },
          "13": {
            "autoSC": "33.60",
            "consSC": "36.80",
            "autoLC": "34.20",
            "consLC": "37.30",
            "pts": 271
          },
          "14": {
            "autoSC": "31.40",
            "consSC": "34.40",
            "autoLC": "32.00",
            "consLC": "34.90",
            "pts": 332
          },
          "15": {
            "autoSC": "30.00",
            "consSC": "32.60",
            "autoLC": "30.60",
            "consLC": "33.20",
            "pts": 381
          },
          "16": {
            "autoSC": "29.80",
            "consSC": "32.00",
            "autoLC": "30.40",
            "consLC": "32.60",
            "pts": 388
          },
          "17": {
            "autoSC": "29.40",
            "consSC": "31.80",
            "autoLC": "30.00",
            "consLC": "32.40",
            "pts": 404
          }
        }
      },
      "100 Fly": {
        "ages": {
          "11": {
            "autoSC": "1:32.00",
            "consSC": "1:51.50",
            "autoLC": "1:32.80",
            "consLC": "1:52.20",
            "pts": 140
          },
          "12": {
            "autoSC": "1:22.50",
            "consSC": "1:32.00",
            "autoLC": "1:23.40",
            "consLC": "1:32.80",
            "pts": 194
          },
          "13": {
            "autoSC": "1:14.50",
            "consSC": "1:23.50",
            "autoLC": "1:15.50",
            "consLC": "1:24.40",
            "pts": 263
          },
          "14": {
            "autoSC": "1:10.00",
            "consSC": "1:16.50",
            "autoLC": "1:11.10",
            "consLC": "1:17.50",
            "pts": 318
          },
          "15": {
            "autoSC": "1:05.50",
            "consSC": "1:12.50",
            "autoLC": "1:06.60",
            "consLC": "1:13.50",
            "pts": 388
          },
          "16": {
            "autoSC": "1:05.50",
            "consSC": "1:10.50",
            "autoLC": "1:06.60",
            "consLC": "1:11.60",
            "pts": 388
          },
          "17": {
            "autoSC": "1:02.50",
            "consSC": "1:10.00",
            "autoLC": "1:03.70",
            "consLC": "1:11.10",
            "pts": 446
          }
        }
      },
      "200 Fly": {
        "ages": {
          "11": {
            "autoSC": "3:41.00",
            "consSC": "4:10.00",
            "autoLC": "3:42.40",
            "consLC": "4:11.30",
            "pts": 113
          },
          "12": {
            "autoSC": "3:11.00",
            "consSC": "3:24.00",
            "autoLC": "3:12.70",
            "consLC": "3:25.50",
            "pts": 175
          },
          "13": {
            "autoSC": "2:50.00",
            "consSC": "3:08.00",
            "autoLC": "2:51.90",
            "consLC": "3:09.70",
            "pts": 248
          },
          "14": {
            "autoSC": "2:44.00",
            "consSC": "2:55.00",
            "autoLC": "2:45.90",
            "consLC": "2:56.80",
            "pts": 276
          },
          "15": {
            "autoSC": "2:28.00",
            "consSC": "2:45.00",
            "autoLC": "2:30.10",
            "consLC": "2:46.90",
            "pts": 376
          },
          "16": {
            "autoSC": "2:28.00",
            "consSC": "2:39.00",
            "autoLC": "2:30.10",
            "consLC": "2:41.00",
            "pts": 376
          },
          "17": {
            "autoSC": "2:28.00",
            "consSC": "2:39.00",
            "autoLC": "2:30.10",
            "consLC": "2:41.00",
            "pts": 376
          }
        }
      },
      "200 IM": {
        "ages": {
          "11": {
            "autoSC": "3:01.00",
            "consSC": "3:26.00",
            "autoLC": "3:03.20",
            "consLC": "3:27.90",
            "pts": 222
          },
          "12": {
            "autoSC": "2:48.00",
            "consSC": "3:05.00",
            "autoLC": "2:50.30",
            "consLC": "3:07.10",
            "pts": 277
          },
          "13": {
            "autoSC": "2:37.00",
            "consSC": "2:54.00",
            "autoLC": "2:39.50",
            "consLC": "2:56.30",
            "pts": 340
          },
          "14": {
            "autoSC": "2:28.00",
            "consSC": "2:41.00",
            "autoLC": "2:30.60",
            "consLC": "2:43.40",
            "pts": 406
          },
          "15": {
            "autoSC": "2:25.00",
            "consSC": "2:35.00",
            "autoLC": "2:27.70",
            "consLC": "2:37.50",
            "pts": 432
          },
          "16": {
            "autoSC": "2:23.00",
            "consSC": "2:34.00",
            "autoLC": "2:25.70",
            "consLC": "2:36.50",
            "pts": 450
          },
          "17": {
            "autoSC": "2:17.00",
            "consSC": "2:31.00",
            "autoLC": "2:19.80",
            "consLC": "2:33.60",
            "pts": 512
          }
        }
      },
      "400 IM": {
        "ages": {
          "11": {
            "autoSC": "6:16.00",
            "consSC": "6:42.00",
            "autoLC": "6:20.70",
            "consLC": "6:46.40",
            "pts": 243
          },
          "12": {
            "autoSC": "5:40.00",
            "consSC": "6:08.00",
            "autoLC": "5:45.10",
            "consLC": "6:12.80",
            "pts": 329
          },
          "13": {
            "autoSC": "5:20.00",
            "consSC": "5:42.00",
            "autoLC": "5:25.40",
            "consLC": "5:47.10",
            "pts": 395
          },
          "14": {
            "autoSC": "5:14.00",
            "consSC": "5:36.00",
            "autoLC": "5:19.50",
            "consLC": "5:41.20",
            "pts": 418
          },
          "15": {
            "autoSC": "5:14.00",
            "consSC": "5:36.00",
            "autoLC": "5:19.50",
            "consLC": "5:41.20",
            "pts": 418
          },
          "16": {
            "autoSC": "5:02.00",
            "consSC": "5:28.00",
            "autoLC": "5:07.80",
            "consLC": "5:33.30",
            "pts": 470
          },
          "17": {
            "autoSC": "",
            "consSC": "",
            "autoLC": "",
            "consLC": "",
            "pts": 250
          }
        }
      },
      "100 IM": {
        "ages": {
          "11": {
            "autoSC": "1:30.00",
            "consSC": "1:32.70",
            "autoLC": "1:31.80",
            "consLC": "1:34.50",
            "pts": 170
          },
          "12": {
            "autoSC": "1:22.00",
            "consSC": "1:24.50",
            "autoLC": "1:23.60",
            "consLC": "1:26.10",
            "pts": 220
          },
          "13": {
            "autoSC": "1:18.00",
            "consSC": "1:20.30",
            "autoLC": "1:19.50",
            "consLC": "1:21.90",
            "pts": 260
          },
          "14": {
            "autoSC": "1:14.00",
            "consSC": "1:16.20",
            "autoLC": "1:15.50",
            "consLC": "1:17.70",
            "pts": 300
          },
          "15": {
            "autoSC": "1:11.00",
            "consSC": "1:13.10",
            "autoLC": "1:12.40",
            "consLC": "1:14.50",
            "pts": 340
          },
          "16": {
            "autoSC": "1:11.00",
            "consSC": "1:13.10",
            "autoLC": "1:12.40",
            "consLC": "1:14.50",
            "pts": 340
          },
          "17": {
            "autoSC": "1:09.00",
            "consSC": "1:11.10",
            "autoLC": "1:10.40",
            "consLC": "1:12.50",
            "pts": 370
          }
        }
      }
    },
    "F": {
      "50 Free": {
        "ages": {
          "11": {
            "autoSC": "33.20",
            "consSC": "37.60",
            "autoLC": "33.80",
            "consLC": "38.20",
            "pts": 329
          },
          "12": {
            "autoSC": "31.40",
            "consSC": "33.60",
            "autoLC": "32.10",
            "consLC": "34.20",
            "pts": 389
          },
          "13": {
            "autoSC": "30.40",
            "consSC": "32.40",
            "autoLC": "31.10",
            "consLC": "33.00",
            "pts": 429
          },
          "14": {
            "autoSC": "29.80",
            "consSC": "31.80",
            "autoLC": "30.50",
            "consLC": "32.50",
            "pts": 455
          },
          "15": {
            "autoSC": "29.60",
            "consSC": "31.60",
            "autoLC": "30.30",
            "consLC": "32.30",
            "pts": 464
          },
          "16": {
            "autoSC": "29.60",
            "consSC": "31.60",
            "autoLC": "30.30",
            "consLC": "32.30",
            "pts": 464
          },
          "17": {
            "autoSC": "29.00",
            "consSC": "31.40",
            "autoLC": "29.70",
            "consLC": "32.10",
            "pts": 494
          }
        }
      },
      "100 Free": {
        "ages": {
          "11": {
            "autoSC": "1:12.50",
            "consSC": "1:24.50",
            "autoLC": "1:13.60",
            "consLC": "1:25.50",
            "pts": 332
          },
          "12": {
            "autoSC": "1:07.50",
            "consSC": "1:14.00",
            "autoLC": "1:08.70",
            "consLC": "1:15.10",
            "pts": 412
          },
          "13": {
            "autoSC": "1:04.50",
            "consSC": "1:09.50",
            "autoLC": "1:05.80",
            "consLC": "1:10.70",
            "pts": 472
          },
          "14": {
            "autoSC": "1:03.50",
            "consSC": "1:08.00",
            "autoLC": "1:04.80",
            "consLC": "1:09.20",
            "pts": 495
          },
          "15": {
            "autoSC": "1:03.50",
            "consSC": "1:08.00",
            "autoLC": "1:04.80",
            "consLC": "1:09.20",
            "pts": 495
          },
          "16": {
            "autoSC": "1:03.50",
            "consSC": "1:08.00",
            "autoLC": "1:04.80",
            "consLC": "1:09.20",
            "pts": 495
          },
          "17": {
            "autoSC": "1:02.50",
            "consSC": "1:07.50",
            "autoLC": "1:03.80",
            "consLC": "1:08.70",
            "pts": 519
          }
        }
      },
      "200 Free": {
        "ages": {
          "11": {
            "autoSC": "2:38.00",
            "consSC": "2:59.00",
            "autoLC": "2:40.20",
            "consLC": "3:00.90",
            "pts": 340
          },
          "12": {
            "autoSC": "2:26.00",
            "consSC": "2:40.00",
            "autoLC": "2:28.40",
            "consLC": "2:42.20",
            "pts": 431
          },
          "13": {
            "autoSC": "2:21.00",
            "consSC": "2:32.00",
            "autoLC": "2:23.40",
            "consLC": "2:34.30",
            "pts": 478
          },
          "14": {
            "autoSC": "2:17.00",
            "consSC": "2:26.00",
            "autoLC": "2:19.50",
            "consLC": "2:28.40",
            "pts": 522
          },
          "15": {
            "autoSC": "2:15.00",
            "consSC": "2:24.00",
            "autoLC": "2:17.50",
            "consLC": "2:26.40",
            "pts": 545
          },
          "16": {
            "autoSC": "2:15.00",
            "consSC": "2:24.00",
            "autoLC": "2:17.50",
            "consLC": "2:26.40",
            "pts": 545
          },
          "17": {
            "autoSC": "2:12.00",
            "consSC": "2:23.00",
            "autoLC": "2:14.60",
            "consLC": "2:25.40",
            "pts": 583
          }
        }
      },
      "400 Free": {
        "ages": {
          "11": {
            "autoSC": "5:32.00",
            "consSC": "6:24.00",
            "autoLC": "5:36.20",
            "consLC": "6:27.70",
            "pts": 338
          },
          "12": {
            "autoSC": "5:14.00",
            "consSC": "5:38.00",
            "autoLC": "5:18.40",
            "consLC": "5:42.10",
            "pts": 399
          },
          "13": {
            "autoSC": "5:02.00",
            "consSC": "5:22.00",
            "autoLC": "5:06.60",
            "consLC": "5:26.30",
            "pts": 449
          },
          "14": {
            "autoSC": "4:52.00",
            "consSC": "5:12.00",
            "autoLC": "4:56.80",
            "consLC": "5:16.50",
            "pts": 497
          },
          "15": {
            "autoSC": "4:48.00",
            "consSC": "5:08.00",
            "autoLC": "4:52.80",
            "consLC": "5:12.50",
            "pts": 518
          },
          "16": {
            "autoSC": "4:48.00",
            "consSC": "5:08.00",
            "autoLC": "4:52.80",
            "consLC": "5:12.50",
            "pts": 518
          },
          "17": {
            "autoSC": "4:42.00",
            "consSC": "5:06.00",
            "autoLC": "4:46.90",
            "consLC": "5:10.60",
            "pts": 551
          }
        }
      },
      "800 Free": {
        "ages": {
          "11": {
            "autoSC": "12:45.00",
            "consSC": "12:45.00",
            "autoLC": "12:52.50",
            "consLC": "12:52.50",
            "pts": 243
          },
          "12": {
            "autoSC": "12:45.00",
            "consSC": "12:45.00",
            "autoLC": "12:52.50",
            "consLC": "12:52.50",
            "pts": 243
          },
          "13": {
            "autoSC": "11:10.00",
            "consSC": "11:10.00",
            "autoLC": "11:18.60",
            "consLC": "11:18.60",
            "pts": 361
          },
          "14": {
            "autoSC": "10:22.00",
            "consSC": "10:22.00",
            "autoLC": "10:31.20",
            "consLC": "10:31.20",
            "pts": 452
          },
          "15": {
            "autoSC": "10:08.00",
            "consSC": "10:08.00",
            "autoLC": "10:17.40",
            "consLC": "10:17.40",
            "pts": 484
          },
          "16": {
            "autoSC": "10:08.00",
            "consSC": "10:08.00",
            "autoLC": "10:17.40",
            "consLC": "10:17.40",
            "pts": 484
          },
          "17": {
            "autoSC": "9:45.00",
            "consSC": "9:45.00",
            "autoLC": "9:54.80",
            "consLC": "9:54.80",
            "pts": 543
          }
        }
      },
      "1500 Free": {
        "ages": {
          "11": {
            "autoSC": "22:45.00",
            "consSC": "22:45.00",
            "autoLC": "23:00.10",
            "consLC": "23:00.10",
            "pts": 294
          },
          "12": {
            "autoSC": "22:45.00",
            "consSC": "22:45.00",
            "autoLC": "23:00.10",
            "consLC": "23:00.10",
            "pts": 294
          },
          "13": {
            "autoSC": "20:44.00",
            "consSC": "20:44.00",
            "autoLC": "21:00.50",
            "consLC": "21:00.50",
            "pts": 389
          },
          "14": {
            "autoSC": "20:03.00",
            "consSC": "20:03.00",
            "autoLC": "20:20.00",
            "consLC": "20:20.00",
            "pts": 430
          },
          "15": {
            "autoSC": "19:40.00",
            "consSC": "19:40.00",
            "autoLC": "19:57.40",
            "consLC": "19:57.40",
            "pts": 455
          },
          "16": {
            "autoSC": "19:40.00",
            "consSC": "19:40.00",
            "autoLC": "19:57.40",
            "consLC": "19:57.40",
            "pts": 455
          },
          "17": {
            "autoSC": "19:10.00",
            "consSC": "19:10.00",
            "autoLC": "19:27.80",
            "consLC": "19:27.80",
            "pts": 492
          }
        }
      },
      "50 Back": {
        "ages": {
          "11": {
            "autoSC": "39.00",
            "consSC": "43.80",
            "autoLC": "39.50",
            "consLC": "44.30",
            "pts": 271
          },
          "12": {
            "autoSC": "36.60",
            "consSC": "39.00",
            "autoLC": "37.10",
            "consLC": "39.50",
            "pts": 328
          },
          "13": {
            "autoSC": "35.40",
            "consSC": "37.80",
            "autoLC": "36.00",
            "consLC": "38.30",
            "pts": 362
          },
          "14": {
            "autoSC": "34.40",
            "consSC": "36.80",
            "autoLC": "35.00",
            "consLC": "37.30",
            "pts": 395
          },
          "15": {
            "autoSC": "34.20",
            "consSC": "36.60",
            "autoLC": "34.80",
            "consLC": "37.10",
            "pts": 402
          },
          "16": {
            "autoSC": "34.20",
            "consSC": "36.60",
            "autoLC": "34.80",
            "consLC": "37.10",
            "pts": 402
          },
          "17": {
            "autoSC": "34.20",
            "consSC": "36.60",
            "autoLC": "34.80",
            "consLC": "37.10",
            "pts": 402
          }
        }
      },
      "100 Back": {
        "ages": {
          "11": {
            "autoSC": "1:22.50",
            "consSC": "1:36.00",
            "autoLC": "1:23.50",
            "consLC": "1:36.80",
            "pts": 294
          },
          "12": {
            "autoSC": "1:17.00",
            "consSC": "1:23.50",
            "autoLC": "1:18.00",
            "consLC": "1:24.50",
            "pts": 362
          },
          "13": {
            "autoSC": "1:14.50",
            "consSC": "1:19.50",
            "autoLC": "1:15.60",
            "consLC": "1:20.50",
            "pts": 399
          },
          "14": {
            "autoSC": "1:12.00",
            "consSC": "1:17.00",
            "autoLC": "1:13.10",
            "consLC": "1:18.00",
            "pts": 443
          },
          "15": {
            "autoSC": "1:12.00",
            "consSC": "1:17.00",
            "autoLC": "1:13.10",
            "consLC": "1:18.00",
            "pts": 443
          },
          "16": {
            "autoSC": "1:12.00",
            "consSC": "1:17.00",
            "autoLC": "1:13.10",
            "consLC": "1:18.00",
            "pts": 443
          },
          "17": {
            "autoSC": "1:11.50",
            "consSC": "1:17.00",
            "autoLC": "1:12.60",
            "consLC": "1:18.00",
            "pts": 452
          }
        }
      },
      "200 Back": {
        "ages": {
          "11": {
            "autoSC": "2:55.00",
            "consSC": "3:18.00",
            "autoLC": "2:56.90",
            "consLC": "3:19.70",
            "pts": 313
          },
          "12": {
            "autoSC": "2:45.00",
            "consSC": "2:59.00",
            "autoLC": "2:47.00",
            "consLC": "3:00.90",
            "pts": 374
          },
          "13": {
            "autoSC": "2:40.00",
            "consSC": "2:51.00",
            "autoLC": "2:42.10",
            "consLC": "2:52.90",
            "pts": 410
          },
          "14": {
            "autoSC": "2:34.00",
            "consSC": "2:45.00",
            "autoLC": "2:36.20",
            "consLC": "2:47.00",
            "pts": 460
          },
          "15": {
            "autoSC": "2:34.00",
            "consSC": "2:45.00",
            "autoLC": "2:36.20",
            "consLC": "2:47.00",
            "pts": 460
          },
          "16": {
            "autoSC": "2:34.00",
            "consSC": "2:45.00",
            "autoLC": "2:36.20",
            "consLC": "2:47.00",
            "pts": 460
          },
          "17": {
            "autoSC": "2:33.00",
            "consSC": "2:45.00",
            "autoLC": "2:35.20",
            "consLC": "2:47.00",
            "pts": 469
          }
        }
      },
      "50 Breast": {
        "ages": {
          "11": {
            "autoSC": "43.80",
            "consSC": "50.00",
            "autoLC": "44.50",
            "consLC": "50.60",
            "pts": 271
          },
          "12": {
            "autoSC": "41.40",
            "consSC": "45.00",
            "autoLC": "42.20",
            "consLC": "45.70",
            "pts": 321
          },
          "13": {
            "autoSC": "39.80",
            "consSC": "42.40",
            "autoLC": "40.60",
            "consLC": "43.10",
            "pts": 362
          },
          "14": {
            "autoSC": "38.80",
            "consSC": "41.40",
            "autoLC": "39.60",
            "consLC": "42.20",
            "pts": 390
          },
          "15": {
            "autoSC": "38.80",
            "consSC": "41.40",
            "autoLC": "39.60",
            "consLC": "42.20",
            "pts": 390
          },
          "16": {
            "autoSC": "38.80",
            "consSC": "41.40",
            "autoLC": "39.60",
            "consLC": "42.20",
            "pts": 390
          },
          "17": {
            "autoSC": "38.80",
            "consSC": "41.40",
            "autoLC": "39.60",
            "consLC": "42.20",
            "pts": 390
          }
        }
      },
      "100 Breast": {
        "ages": {
          "11": {
            "autoSC": "1:35.50",
            "consSC": "1:51.00",
            "autoLC": "1:36.80",
            "consLC": "1:52.10",
            "pts": 278
          },
          "12": {
            "autoSC": "1:29.00",
            "consSC": "1:37.00",
            "autoLC": "1:30.40",
            "consLC": "1:38.30",
            "pts": 343
          },
          "13": {
            "autoSC": "1:25.00",
            "consSC": "1:31.00",
            "autoLC": "1:26.50",
            "consLC": "1:32.40",
            "pts": 394
          },
          "14": {
            "autoSC": "1:22.50",
            "consSC": "1:28.00",
            "autoLC": "1:24.00",
            "consLC": "1:29.40",
            "pts": 431
          },
          "15": {
            "autoSC": "1:22.50",
            "consSC": "1:28.00",
            "autoLC": "1:24.00",
            "consLC": "1:29.40",
            "pts": 431
          },
          "16": {
            "autoSC": "1:22.50",
            "consSC": "1:28.00",
            "autoLC": "1:24.00",
            "consLC": "1:29.40",
            "pts": 431
          },
          "17": {
            "autoSC": "1:22.50",
            "consSC": "1:28.00",
            "autoLC": "1:24.00",
            "consLC": "1:29.40",
            "pts": 431
          }
        }
      },
      "200 Breast": {
        "ages": {
          "11": {
            "autoSC": "3:22.00",
            "consSC": "3:51.00",
            "autoLC": "3:24.60",
            "consLC": "3:53.30",
            "pts": 295
          },
          "12": {
            "autoSC": "3:08.00",
            "consSC": "3:26.00",
            "autoLC": "3:10.80",
            "consLC": "3:28.60",
            "pts": 366
          },
          "13": {
            "autoSC": "3:03.00",
            "consSC": "3:15.00",
            "autoLC": "3:05.90",
            "consLC": "3:17.70",
            "pts": 397
          },
          "14": {
            "autoSC": "2:58.00",
            "consSC": "3:10.00",
            "autoLC": "3:00.90",
            "consLC": "3:12.80",
            "pts": 432
          },
          "15": {
            "autoSC": "2:58.00",
            "consSC": "3:10.00",
            "autoLC": "3:00.90",
            "consLC": "3:12.80",
            "pts": 432
          },
          "16": {
            "autoSC": "2:58.00",
            "consSC": "3:10.00",
            "autoLC": "3:00.90",
            "consLC": "3:12.80",
            "pts": 432
          },
          "17": {
            "autoSC": "2:58.00",
            "consSC": "3:10.00",
            "autoLC": "3:00.90",
            "consLC": "3:12.80",
            "pts": 432
          }
        }
      },
      "50 Fly": {
        "ages": {
          "11": {
            "autoSC": "38.00",
            "consSC": "43.20",
            "autoLC": "38.50",
            "consLC": "43.60",
            "pts": 264
          },
          "12": {
            "autoSC": "35.20",
            "consSC": "38.40",
            "autoLC": "35.70",
            "consLC": "38.90",
            "pts": 332
          },
          "13": {
            "autoSC": "33.80",
            "consSC": "36.00",
            "autoLC": "34.40",
            "consLC": "36.50",
            "pts": 375
          },
          "14": {
            "autoSC": "33.00",
            "consSC": "35.20",
            "autoLC": "33.60",
            "consLC": "35.70",
            "pts": 403
          },
          "15": {
            "autoSC": "32.60",
            "consSC": "34.80",
            "autoLC": "33.20",
            "consLC": "35.30",
            "pts": 418
          },
          "16": {
            "autoSC": "32.60",
            "consSC": "34.80",
            "autoLC": "33.20",
            "consLC": "35.30",
            "pts": 418
          },
          "17": {
            "autoSC": "32.60",
            "consSC": "34.80",
            "autoLC": "33.20",
            "consLC": "35.30",
            "pts": 418
          }
        }
      },
      "100 Fly": {
        "ages": {
          "11": {
            "autoSC": "1:29.00",
            "consSC": "1:47.00",
            "autoLC": "1:29.90",
            "consLC": "1:47.70",
            "pts": 223
          },
          "12": {
            "autoSC": "1:20.00",
            "consSC": "1:28.50",
            "autoLC": "1:20.90",
            "consLC": "1:29.40",
            "pts": 308
          },
          "13": {
            "autoSC": "1:16.50",
            "consSC": "1:22.00",
            "autoLC": "1:17.50",
            "consLC": "1:22.90",
            "pts": 352
          },
          "14": {
            "autoSC": "1:13.00",
            "consSC": "1:18.00",
            "autoLC": "1:14.00",
            "consLC": "1:19.00",
            "pts": 405
          },
          "15": {
            "autoSC": "1:13.00",
            "consSC": "1:18.00",
            "autoLC": "1:14.00",
            "consLC": "1:19.00",
            "pts": 405
          },
          "16": {
            "autoSC": "1:13.00",
            "consSC": "1:18.00",
            "autoLC": "1:14.00",
            "consLC": "1:19.00",
            "pts": 405
          },
          "17": {
            "autoSC": "1:11.00",
            "consSC": "1:17.00",
            "autoLC": "1:12.10",
            "consLC": "1:18.00",
            "pts": 441
          }
        }
      },
      "200 Fly": {
        "ages": {
          "11": {
            "autoSC": "3:24.00",
            "consSC": "4:06.00",
            "autoLC": "3:25.50",
            "consLC": "4:07.30",
            "pts": 201
          },
          "12": {
            "autoSC": "3:05.00",
            "consSC": "3:20.00",
            "autoLC": "3:06.70",
            "consLC": "3:21.60",
            "pts": 270
          },
          "13": {
            "autoSC": "2:49.00",
            "consSC": "3:04.00",
            "autoLC": "2:50.90",
            "consLC": "3:05.70",
            "pts": 354
          },
          "14": {
            "autoSC": "2:47.00",
            "consSC": "2:58.00",
            "autoLC": "2:48.90",
            "consLC": "2:59.80",
            "pts": 367
          },
          "15": {
            "autoSC": "2:44.00",
            "consSC": "2:55.00",
            "autoLC": "2:45.90",
            "consLC": "2:56.80",
            "pts": 387
          },
          "16": {
            "autoSC": "2:44.00",
            "consSC": "2:55.00",
            "autoLC": "2:45.90",
            "consLC": "2:56.80",
            "pts": 387
          },
          "17": {
            "autoSC": "2:44.00",
            "consSC": "2:55.00",
            "autoLC": "2:45.90",
            "consLC": "2:56.80",
            "pts": 387
          }
        }
      },
      "200 IM": {
        "ages": {
          "11": {
            "autoSC": "2:58.00",
            "consSC": "3:25.00",
            "autoLC": "3:00.20",
            "consLC": "3:26.90",
            "pts": 320
          },
          "12": {
            "autoSC": "2:47.00",
            "consSC": "3:02.00",
            "autoLC": "2:49.30",
            "consLC": "3:04.20",
            "pts": 388
          },
          "13": {
            "autoSC": "2:40.00",
            "consSC": "2:53.00",
            "autoLC": "2:42.40",
            "consLC": "2:55.30",
            "pts": 441
          },
          "14": {
            "autoSC": "2:35.00",
            "consSC": "2:47.00",
            "autoLC": "2:37.50",
            "consLC": "2:49.30",
            "pts": 485
          },
          "15": {
            "autoSC": "2:35.00",
            "consSC": "2:46.00",
            "autoLC": "2:37.50",
            "consLC": "2:48.40",
            "pts": 485
          },
          "16": {
            "autoSC": "2:35.00",
            "consSC": "2:46.00",
            "autoLC": "2:37.50",
            "consLC": "2:48.40",
            "pts": 485
          },
          "17": {
            "autoSC": "2:34.00",
            "consSC": "2:46.00",
            "autoLC": "2:36.50",
            "consLC": "2:48.40",
            "pts": 495
          }
        }
      },
      "400 IM": {
        "ages": {
          "11": {
            "autoSC": "5:54.00",
            "consSC": "6:28.00",
            "autoLC": "5:58.90",
            "consLC": "6:32.50",
            "pts": 391
          },
          "12": {
            "autoSC": "5:38.00",
            "consSC": "6:02.00",
            "autoLC": "5:43.20",
            "consLC": "6:06.80",
            "pts": 449
          },
          "13": {
            "autoSC": "5:38.00",
            "consSC": "6:00.00",
            "autoLC": "5:43.20",
            "consLC": "6:04.90",
            "pts": 449
          },
          "14": {
            "autoSC": "5:36.00",
            "consSC": "5:58.00",
            "autoLC": "5:41.20",
            "consLC": "6:02.90",
            "pts": 457
          },
          "15": {
            "autoSC": "5:36.00",
            "consSC": "5:58.00",
            "autoLC": "5:41.20",
            "consLC": "6:02.90",
            "pts": 457
          },
          "16": {
            "autoSC": "5:28.00",
            "consSC": "5:56.00",
            "autoLC": "5:33.30",
            "consLC": "6:00.90",
            "pts": 492
          },
          "17": {
            "autoSC": "",
            "consSC": "",
            "autoLC": "",
            "consLC": "",
            "pts": 250
          }
        }
      },
      "100 IM": {
        "ages": {
          "11": {
            "autoSC": "1:30.00",
            "consSC": "1:32.70",
            "autoLC": "1:31.80",
            "consLC": "1:34.50",
            "pts": 170
          },
          "12": {
            "autoSC": "1:22.00",
            "consSC": "1:24.50",
            "autoLC": "1:23.60",
            "consLC": "1:26.10",
            "pts": 220
          },
          "13": {
            "autoSC": "1:18.00",
            "consSC": "1:20.30",
            "autoLC": "1:19.50",
            "consLC": "1:21.90",
            "pts": 260
          },
          "14": {
            "autoSC": "1:14.00",
            "consSC": "1:16.20",
            "autoLC": "1:15.50",
            "consLC": "1:17.70",
            "pts": 300
          },
          "15": {
            "autoSC": "1:11.00",
            "consSC": "1:13.10",
            "autoLC": "1:12.40",
            "consLC": "1:14.50",
            "pts": 340
          },
          "16": {
            "autoSC": "1:11.00",
            "consSC": "1:13.10",
            "autoLC": "1:12.40",
            "consLC": "1:14.50",
            "pts": 340
          },
          "17": {
            "autoSC": "1:09.00",
            "consSC": "1:11.10",
            "autoLC": "1:10.40",
            "consLC": "1:12.50",
            "pts": 370
          }
        }
      }
    }
  },
  "REGIONAL": {
    "M": {
      "50 Free": {
        "ages": {
          "12": {
            "autoSC": "30.4",
            "consSC": "31.7",
            "autoLC": "31.1",
            "consLC": "32.4",
            "pts": 291
          },
          "13": {
            "autoSC": "29.0",
            "consSC": "29.8",
            "autoLC": "29.7",
            "consLC": "30.5",
            "pts": 335
          },
          "14": {
            "autoSC": "26.9",
            "consSC": "27.7",
            "autoLC": "27.7",
            "consLC": "28.4",
            "pts": 420
          },
          "15": {
            "autoSC": "26.1",
            "consSC": "26.4",
            "autoLC": "26.8",
            "consLC": "27.2",
            "pts": 460
          },
          "16": {
            "autoSC": "24.8",
            "consSC": "24.8",
            "autoLC": "25.7",
            "consLC": "25.7",
            "pts": 537
          },
          "17": {
            "autoSC": "24.5",
            "consSC": "24.5",
            "autoLC": "25.3",
            "consLC": "25.3",
            "pts": 557
          }
        }
      },
      "100 Free": {
        "ages": {
          "12": {
            "autoSC": "1:06.8",
            "consSC": "1:10.9",
            "autoLC": "1:08.0",
            "consLC": "1:12.1",
            "pts": 302
          },
          "13": {
            "autoSC": "1:03.1",
            "consSC": "1:05.5",
            "autoLC": "1:04.4",
            "consLC": "1:06.8",
            "pts": 358
          },
          "14": {
            "autoSC": "58.8",
            "consSC": "1:00.8",
            "autoLC": "1:00.2",
            "consLC": "1:02.2",
            "pts": 443
          },
          "15": {
            "autoSC": "56.4",
            "consSC": "57.8",
            "autoLC": "57.9",
            "consLC": "59.2",
            "pts": 502
          },
          "16": {
            "autoSC": "54.0",
            "consSC": "54.0",
            "autoLC": "55.6",
            "consLC": "55.6",
            "pts": 572
          },
          "17": {
            "autoSC": "52.9",
            "consSC": "52.9",
            "autoLC": "54.5",
            "consLC": "54.5",
            "pts": 609
          }
        }
      },
      "200 Free": {
        "ages": {
          "12": {
            "autoSC": "2:25.5",
            "consSC": "2:34.8",
            "autoLC": "2:27.9",
            "consLC": "2:37.0",
            "pts": 318
          },
          "13": {
            "autoSC": "2:18.9",
            "consSC": "2:22.1",
            "autoLC": "2:21.4",
            "consLC": "2:24.5",
            "pts": 366
          },
          "14": {
            "autoSC": "2:09.9",
            "consSC": "2:12.2",
            "autoLC": "2:12.5",
            "consLC": "2:14.8",
            "pts": 447
          },
          "15": {
            "autoSC": "2:02.3",
            "consSC": "2:07.8",
            "autoLC": "2:05.1",
            "consLC": "2:10.5",
            "pts": 536
          },
          "16": {
            "autoSC": "1:59.4",
            "consSC": "1:59.4",
            "autoLC": "2:02.3",
            "consLC": "2:02.3",
            "pts": 576
          },
          "17": {
            "autoSC": "1:54.7",
            "consSC": "1:54.7",
            "autoLC": "1:57.7",
            "consLC": "1:57.7",
            "pts": 650
          }
        }
      },
      "400 Free": {
        "ages": {
          "12": {
            "autoSC": "5:08.5",
            "consSC": "5:30.8",
            "autoLC": "5:13.0",
            "consLC": "5:35.0",
            "pts": 325
          },
          "13": {
            "autoSC": "4:57.6",
            "consSC": "5:05.0",
            "autoLC": "5:02.2",
            "consLC": "5:09.6",
            "pts": 362
          },
          "14": {
            "autoSC": "4:36.9",
            "consSC": "4:44.8",
            "autoLC": "4:41.9",
            "consLC": "4:49.7",
            "pts": 450
          },
          "15": {
            "autoSC": "4:22.6",
            "consSC": "4:31.1",
            "autoLC": "4:27.9",
            "consLC": "4:36.2",
            "pts": 528
          },
          "16": {
            "autoSC": "4:13.9",
            "consSC": "4:13.9",
            "autoLC": "4:19.4",
            "consLC": "4:19.4",
            "pts": 584
          },
          "17": {
            "autoSC": "4:12.6",
            "consSC": "4:12.6",
            "autoLC": "4:18.1",
            "consLC": "4:18.1",
            "pts": 593
          }
        }
      },
      "800 Free": {
        "ages": {
          "12": {
            "autoSC": "10:33.1",
            "consSC": "11:31.7",
            "autoLC": "10:42.1",
            "consLC": "11:40.0",
            "pts": 336
          },
          "13": {
            "autoSC": "10:04.5",
            "consSC": "10:19.1",
            "autoLC": "10:14.0",
            "consLC": "10:28.4",
            "pts": 386
          },
          "14": {
            "autoSC": "9:26.5",
            "consSC": "9:56.4",
            "autoLC": "9:36.6",
            "consLC": "10.06.0",
            "pts": 470
          },
          "15": {
            "autoSC": "9:07.8",
            "consSC": "9:21.5",
            "autoLC": "9:31.7",
            "consLC": "40",
            "pts": 519
          },
          "16": {
            "autoSC": "8:43.3",
            "consSC": "8:43.3",
            "autoLC": "9:18.2",
            "consLC": "9:18.2",
            "pts": 596
          },
          "17": {
            "autoSC": "8:28.7",
            "consSC": "8:28.7",
            "autoLC": "8:54.2",
            "consLC": "8:54.2",
            "pts": 649
          }
        }
      },
      "1500 Free": {
        "ages": {
          "12": {
            "autoSC": "20:35.8",
            "consSC": "23:45.6",
            "autoLC": "20:52.4",
            "consLC": "24:00.0",
            "pts": 321
          },
          "13": {
            "autoSC": "19:08.0",
            "consSC": "19:46.2",
            "autoLC": "19:25.9",
            "consLC": "20:03.5",
            "pts": 401
          },
          "14": {
            "autoSC": "18:04.1",
            "consSC": "19:42.7",
            "autoLC": "18:23.0",
            "consLC": "20:00.0",
            "pts": 476
          },
          "15": {
            "autoSC": "17:29.5",
            "consSC": "17:58.3",
            "autoLC": "17:49.0",
            "consLC": "18:17.2",
            "pts": 525
          },
          "16": {
            "autoSC": "16:38.4",
            "consSC": "16:38.4",
            "autoLC": "16:58.8",
            "consLC": "16:58.8",
            "pts": 610
          },
          "17": {
            "autoSC": "16:16.7",
            "consSC": "16:16.7",
            "autoLC": "16:37.5",
            "consLC": "16:37.5",
            "pts": 651
          }
        }
      },
      "50 Back": {
        "ages": {
          "12": {
            "autoSC": "35.3",
            "consSC": "37.5",
            "autoLC": "35.8",
            "consLC": "38.0",
            "pts": 245
          },
          "13": {
            "autoSC": "33.8",
            "consSC": "35.2",
            "autoLC": "34.4",
            "consLC": "35.8",
            "pts": 279
          },
          "14": {
            "autoSC": "31.9",
            "consSC": "33.0",
            "autoLC": "32.5",
            "consLC": "33.7",
            "pts": 332
          },
          "15": {
            "autoSC": "30.6",
            "consSC": "31.9",
            "autoLC": "31.2",
            "consLC": "32.5",
            "pts": 377
          },
          "16": {
            "autoSC": "29.1",
            "consSC": "29.1",
            "autoLC": "29.8",
            "consLC": "29.8",
            "pts": 438
          },
          "17": {
            "autoSC": "29.1",
            "consSC": "29.1",
            "autoLC": "29.8",
            "consLC": "29.8",
            "pts": 438
          }
        }
      },
      "100 Back": {
        "ages": {
          "12": {
            "autoSC": "1:16.6",
            "consSC": "1:22.0",
            "autoLC": "1:17.6",
            "consLC": "1:23.0",
            "pts": 251
          },
          "13": {
            "autoSC": "1:13.9",
            "consSC": "1:16.0",
            "autoLC": "1:15.0",
            "consLC": "1:17.1",
            "pts": 279
          },
          "14": {
            "autoSC": "1:09.0",
            "consSC": "1:10.7",
            "autoLC": "1:10.2",
            "consLC": "1:11.8",
            "pts": 343
          },
          "15": {
            "autoSC": "1:04.6",
            "consSC": "1.07.7",
            "autoLC": "1:05.8",
            "consLC": "1:08.9",
            "pts": 418
          },
          "16": {
            "autoSC": "1:02.1",
            "consSC": "1:02.1",
            "autoLC": "1:03.4",
            "consLC": "1:03.4",
            "pts": 471
          },
          "17": {
            "autoSC": "1:02.1",
            "consSC": "1:02.1",
            "autoLC": "1:03.4",
            "consLC": "1:03.4",
            "pts": 471
          }
        }
      },
      "200 Back": {
        "ages": {
          "12": {
            "autoSC": "2:44.3",
            "consSC": "2:53.5",
            "autoLC": "2:46.3",
            "consLC": "2:55.5",
            "pts": 265
          },
          "13": {
            "autoSC": "2:36.7",
            "consSC": "2:42.4",
            "autoLC": "2:38.8",
            "consLC": "2:44.4",
            "pts": 306
          },
          "14": {
            "autoSC": "2:26.9",
            "consSC": "2:32.5",
            "autoLC": "2:29.2",
            "consLC": "2:34.7",
            "pts": 371
          },
          "15": {
            "autoSC": "2:17.5",
            "consSC": "2:24.2",
            "autoLC": "2:19.9",
            "consLC": "2:26.5",
            "pts": 453
          },
          "16": {
            "autoSC": "2:11.8",
            "consSC": "2:11.8",
            "autoLC": "2:14.3",
            "consLC": "2:14.3",
            "pts": 514
          },
          "17": {
            "autoSC": "2:11.6",
            "consSC": "2:11.6",
            "autoLC": "2:14.1",
            "consLC": "2:14.1",
            "pts": 517
          }
        }
      },
      "50 Breast": {
        "ages": {
          "12": {
            "autoSC": "40.4",
            "consSC": "43.2",
            "autoLC": "41.2",
            "consLC": "43.9",
            "pts": 235
          },
          "13": {
            "autoSC": "38.0",
            "consSC": "39.4",
            "autoLC": "38.8",
            "consLC": "40.2",
            "pts": 283
          },
          "14": {
            "autoSC": "35.2",
            "consSC": "36.3",
            "autoLC": "36.1",
            "consLC": "37.2",
            "pts": 356
          },
          "15": {
            "autoSC": "33.7",
            "consSC": "35.2",
            "autoLC": "34.6",
            "consLC": "36.1",
            "pts": 405
          },
          "16": {
            "autoSC": "32.3",
            "consSC": "32.3",
            "autoLC": "33.2",
            "consLC": "33.2",
            "pts": 460
          },
          "17": {
            "autoSC": "31.7",
            "consSC": "31.7",
            "autoLC": "32.7",
            "consLC": "32.7",
            "pts": 487
          }
        }
      },
      "100 Breast": {
        "ages": {
          "12": {
            "autoSC": "1:29.0",
            "consSC": "1:36.2",
            "autoLC": "1:30.4",
            "consLC": "1:37.5",
            "pts": 239
          },
          "13": {
            "autoSC": "1:24.6",
            "consSC": "1:27.6",
            "autoLC": "1:26.1",
            "consLC": "1:29.0",
            "pts": 278
          },
          "14": {
            "autoSC": "1:17.9",
            "consSC": "1:24.5",
            "autoLC": "1:19.5",
            "consLC": "1:26.0",
            "pts": 357
          },
          "15": {
            "autoSC": "1:14.9",
            "consSC": "1:16.3",
            "autoLC": "1:16.6",
            "consLC": "1:17.9",
            "pts": 402
          },
          "16": {
            "autoSC": "1:09.7",
            "consSC": "1:09.7",
            "autoLC": "1:11.5",
            "consLC": "1:11.5",
            "pts": 498
          },
          "17": {
            "autoSC": "1:08.8",
            "consSC": "1:08.8",
            "autoLC": "1:10.6",
            "consLC": "1:10.6",
            "pts": 518
          }
        }
      },
      "200 Breast": {
        "ages": {
          "12": {
            "autoSC": "3:09.1",
            "consSC": "3:23.4",
            "autoLC": "3:11.9",
            "consLC": "3:26.0",
            "pts": 256
          },
          "13": {
            "autoSC": "2:59.9",
            "consSC": "3:06.9",
            "autoLC": "3:02.8",
            "consLC": "3:09.7",
            "pts": 297
          },
          "14": {
            "autoSC": "2:48.5",
            "consSC": "2:55.2",
            "autoLC": "2:51.6",
            "consLC": "2:58.2",
            "pts": 362
          },
          "15": {
            "autoSC": "2:38.8",
            "consSC": "2:47.3",
            "autoLC": "2:42.1",
            "consLC": "2:50.4",
            "pts": 433
          },
          "16": {
            "autoSC": "2:29.7",
            "consSC": "2:29.7",
            "autoLC": "2:33.2",
            "consLC": "2:33.2",
            "pts": 517
          },
          "17": {
            "autoSC": "2:29.7",
            "consSC": "2:29.7",
            "autoLC": "2:33.2",
            "consLC": "2:33.2",
            "pts": 517
          }
        }
      },
      "50 Fly": {
        "ages": {
          "12": {
            "autoSC": "33.8",
            "consSC": "36.1",
            "autoLC": "34.4",
            "consLC": "36.6",
            "pts": 266
          },
          "13": {
            "autoSC": "32.0",
            "consSC": "33.4",
            "autoLC": "32.6",
            "consLC": "34.0",
            "pts": 313
          },
          "14": {
            "autoSC": "29.7",
            "consSC": "30.5",
            "autoLC": "30.3",
            "consLC": "31.1",
            "pts": 392
          },
          "15": {
            "autoSC": "28.7",
            "consSC": "29.4",
            "autoLC": "29.3",
            "consLC": "30.0",
            "pts": 435
          },
          "16": {
            "autoSC": "27.1",
            "consSC": "27.1",
            "autoLC": "27.8",
            "consLC": "27.8",
            "pts": 516
          },
          "17": {
            "autoSC": "27.1",
            "consSC": "27.1",
            "autoLC": "27.8",
            "consLC": "27.8",
            "pts": 516
          }
        }
      },
      "100 Fly": {
        "ages": {
          "12": {
            "autoSC": "1:17.8",
            "consSC": "1:26.1",
            "autoLC": "1:18.8",
            "consLC": "1:27.0",
            "pts": 231
          },
          "13": {
            "autoSC": "1:14.1",
            "consSC": "1:16.9",
            "autoLC": "1:15.2",
            "consLC": "1:17.9",
            "pts": 268
          },
          "14": {
            "autoSC": "1:07.1",
            "consSC": "1:09.9",
            "autoLC": "1:08.3",
            "consLC": "1:11.0",
            "pts": 361
          },
          "15": {
            "autoSC": "1:02.5",
            "consSC": "1:07.1",
            "autoLC": "1:03.7",
            "consLC": "1.08.2",
            "pts": 446
          },
          "16": {
            "autoSC": "1:01.4",
            "consSC": "1:01.4",
            "autoLC": "1:02.6",
            "consLC": "1:02.6",
            "pts": 471
          },
          "17": {
            "autoSC": "59.1",
            "consSC": "59.1",
            "autoLC": "1:00.4",
            "consLC": "1:00.4",
            "pts": 528
          }
        }
      },
      "200 Fly": {
        "ages": {
          "12": {
            "autoSC": "3:03.6",
            "consSC": "3:48.6",
            "autoLC": "3:05.3",
            "consLC": "3:50.0",
            "pts": 197
          },
          "13": {
            "autoSC": "2:45.9",
            "consSC": "2:56.3",
            "autoLC": "2:47.8",
            "consLC": "2:58.1",
            "pts": 267
          },
          "14": {
            "autoSC": "2:32.7",
            "consSC": "2:51.2",
            "autoLC": "2:34.8",
            "consLC": "2:53.0",
            "pts": 342
          },
          "15": {
            "autoSC": "2:24.3",
            "consSC": "2:33.7",
            "autoLC": "2:26.4",
            "consLC": "2:35.7",
            "pts": 405
          },
          "16": {
            "autoSC": "2:24.3",
            "consSC": "2:24.3",
            "autoLC": "2:26.4",
            "consLC": "2:26.4",
            "pts": 405
          },
          "17": {
            "autoSC": "2:24.3",
            "consSC": "2:24.3",
            "autoLC": "2:26.4",
            "consLC": "2:26.4",
            "pts": 405
          }
        }
      },
      "200 IM": {
        "ages": {
          "12": {
            "autoSC": "2:46.7",
            "consSC": "2:56.6",
            "autoLC": "2:49.1",
            "consLC": "2:58.8",
            "pts": 284
          },
          "13": {
            "autoSC": "2:38.1",
            "consSC": "2:41.6",
            "autoLC": "2:40.6",
            "consLC": "2:44.0",
            "pts": 333
          },
          "14": {
            "autoSC": "2:26.7",
            "consSC": "2:32.1",
            "autoLC": "2:29.4",
            "consLC": "2:34.7",
            "pts": 417
          },
          "15": {
            "autoSC": "2:19.5",
            "consSC": "2:23.6",
            "autoLC": "2:22.3",
            "consLC": "2:26.4",
            "pts": 485
          },
          "16": {
            "autoSC": "2:15.1",
            "consSC": "2:15.1",
            "autoLC": "2:18.0",
            "consLC": "2:18.0",
            "pts": 534
          },
          "17": {
            "autoSC": "2:13.2",
            "consSC": "2:13.2",
            "autoLC": "2:16.1",
            "consLC": "2:16.1",
            "pts": 557
          }
        }
      },
      "400 IM": {
        "ages": {
          "12": {
            "autoSC": "5:57.6",
            "consSC": "6:45.7",
            "autoLC": "6:02.5",
            "consLC": "6:50.0",
            "pts": 283
          },
          "13": {
            "autoSC": "5:37.8",
            "consSC": "5:52.0",
            "autoLC": "5:43.0",
            "consLC": "5:57.0",
            "pts": 335
          },
          "14": {
            "autoSC": "5:15.4",
            "consSC": "5:31.1",
            "autoLC": "5:20.9",
            "consLC": "5:36.4",
            "pts": 412
          },
          "15": {
            "autoSC": "5:06.1",
            "consSC": "5:17.6",
            "autoLC": "5:11.8",
            "consLC": "5:23.1",
            "pts": 451
          },
          "16": {
            "autoSC": "4:54.8",
            "consSC": "4:54.8",
            "autoLC": "5:00.7",
            "consLC": "5:00.7",
            "pts": 505
          },
          "17": {
            "autoSC": "4:54.8",
            "consSC": "4:54.8",
            "autoLC": "5:00.7",
            "consLC": "5:00.7",
            "pts": 505
          }
        }
      }
    },
    "F": {
      "50 Free": {
        "ages": {
          "12": {
            "autoSC": "30.4",
            "consSC": "31.3",
            "autoLC": "31.1",
            "consLC": "32.0",
            "pts": 429
          },
          "13": {
            "autoSC": "29.1",
            "consSC": "29.9",
            "autoLC": "29.8",
            "consLC": "30.6",
            "pts": 489
          },
          "14": {
            "autoSC": "28.9",
            "consSC": "29.3",
            "autoLC": "29.6",
            "consLC": "30.0",
            "pts": 499
          },
          "15": {
            "autoSC": "28.2",
            "consSC": "28.9",
            "autoLC": "28.9",
            "consLC": "29.6",
            "pts": 537
          },
          "16": {
            "autoSC": "27.7",
            "consSC": "27.7",
            "autoLC": "28.4",
            "consLC": "28.4",
            "pts": 567
          },
          "17": {
            "autoSC": "27.2",
            "consSC": "27.2",
            "autoLC": "28.0",
            "consLC": "28.0",
            "pts": 599
          }
        }
      },
      "100 Free": {
        "ages": {
          "12": {
            "autoSC": "1:06.5",
            "consSC": "1:09.2",
            "autoLC": "1:07.8",
            "consLC": "1:10.4",
            "pts": 431
          },
          "13": {
            "autoSC": "1:03.6",
            "consSC": "1:05.0",
            "autoLC": "1:04.9",
            "consLC": "1:06.3",
            "pts": 493
          },
          "14": {
            "autoSC": "1:02.4",
            "consSC": "1:04.1",
            "autoLC": "1:03.7",
            "consLC": "1:05.3",
            "pts": 522
          },
          "15": {
            "autoSC": "1:00.7",
            "consSC": "1:01.7",
            "autoLC": "1:02.1",
            "consLC": "1:03.4",
            "pts": 567
          },
          "16": {
            "autoSC": "59.1",
            "consSC": "59.1",
            "autoLC": "1:00.5",
            "consLC": "1:00.5",
            "pts": 614
          },
          "17": {
            "autoSC": "58.6",
            "consSC": "58.6",
            "autoLC": "1:00.0",
            "consLC": "1:00.0",
            "pts": 630
          }
        }
      },
      "200 Free": {
        "ages": {
          "12": {
            "autoSC": "2:24.6",
            "consSC": "2:32.2",
            "autoLC": "2:27.0",
            "consLC": "2:34.5",
            "pts": 443
          },
          "13": {
            "autoSC": "2:17.5",
            "consSC": "2:21.5",
            "autoLC": "2:20.0",
            "consLC": "2:23.9",
            "pts": 516
          },
          "14": {
            "autoSC": "2:14.0",
            "consSC": "2:18.0",
            "autoLC": "2:16.6",
            "consLC": "2:20.5",
            "pts": 557
          },
          "15": {
            "autoSC": "2:10.8",
            "consSC": "2:16.0",
            "autoLC": "2:13.4",
            "consLC": "2:18.5",
            "pts": 599
          },
          "16": {
            "autoSC": "2:08.4",
            "consSC": "2:08.4",
            "autoLC": "2:11.1",
            "consLC": "2:11.1",
            "pts": 634
          },
          "17": {
            "autoSC": "2:08.4",
            "consSC": "2:08.4",
            "autoLC": "2:11.1",
            "consLC": "2:11.1",
            "pts": 634
          }
        }
      },
      "400 Free": {
        "ages": {
          "12": {
            "autoSC": "5:06.4",
            "consSC": "5:22.7",
            "autoLC": "5:11.0",
            "consLC": "5:27.0",
            "pts": 430
          },
          "13": {
            "autoSC": "4:51.1",
            "consSC": "4:59.4",
            "autoLC": "4:55.9",
            "consLC": "5:04.0",
            "pts": 501
          },
          "14": {
            "autoSC": "4:43.8",
            "consSC": "4:51.8",
            "autoLC": "4:48.8",
            "consLC": "4:56.6",
            "pts": 541
          },
          "15": {
            "autoSC": "4:38.8",
            "consSC": "4:45.6",
            "autoLC": "4:43.8",
            "consLC": "4:50.5",
            "pts": 571
          },
          "16": {
            "autoSC": "4:30.0",
            "consSC": "4:30.0",
            "autoLC": "4:35.2",
            "consLC": "4:35.2",
            "pts": 628
          },
          "17": {
            "autoSC": "4:30.0",
            "consSC": "4:30.0",
            "autoLC": "4:35.2",
            "consLC": "4:35.2",
            "pts": 628
          }
        }
      },
      "800 Free": {
        "ages": {
          "12": {
            "autoSC": "10:42.9",
            "consSC": "11:11.4",
            "autoLC": "10:51.8",
            "consLC": "11:20.0",
            "pts": 409
          },
          "13": {
            "autoSC": "9:40.5",
            "consSC": "10:05.6",
            "autoLC": "9:50.4",
            "consLC": "10:15.1",
            "pts": 556
          },
          "14": {
            "autoSC": "9:37.2",
            "consSC": "9:58.3",
            "autoLC": "9:47.1",
            "consLC": "10:07.9",
            "pts": 565
          },
          "15": {
            "autoSC": "9:26.9",
            "consSC": "9:42.4",
            "autoLC": "9:52.2",
            "consLC": "40",
            "pts": 597
          },
          "16": {
            "autoSC": "9:13.6",
            "consSC": "9:13.6",
            "autoLC": "9:37.0",
            "consLC": "9:37.0",
            "pts": 641
          },
          "17": {
            "autoSC": "9:01.9",
            "consSC": "9:01.9",
            "autoLC": "9:23.9",
            "consLC": "9:23.9",
            "pts": 683
          }
        }
      },
      "1500 Free": {
        "ages": {
          "12": {
            "autoSC": "21:30.7",
            "consSC": "21:49.3",
            "autoLC": "21:46.6",
            "consLC": "22:05.0",
            "pts": 348
          },
          "13": {
            "autoSC": "18:54.1",
            "consSC": "20:13.1",
            "autoLC": "19:12.2",
            "consLC": "20:30.0",
            "pts": 513
          },
          "14": {
            "autoSC": "18:54.1",
            "consSC": "19:13.7",
            "autoLC": "19:12.2",
            "consLC": "19:31.5",
            "pts": 513
          },
          "15": {
            "autoSC": "18:09.7",
            "consSC": "18:55.2",
            "autoLC": "18:28.5",
            "consLC": "19:13.2",
            "pts": 579
          },
          "16": {
            "autoSC": "17:50.1",
            "consSC": "17:50.1",
            "autoLC": "18:09.2",
            "consLC": "18:09.2",
            "pts": 611
          },
          "17": {
            "autoSC": "17:50.1",
            "consSC": "17:50.1",
            "autoLC": "18:09.2",
            "consLC": "18:09.2",
            "pts": 611
          }
        }
      },
      "50 Back": {
        "ages": {
          "12": {
            "autoSC": "35.8",
            "consSC": "37.3",
            "autoLC": "36.4",
            "consLC": "37.8",
            "pts": 350
          },
          "13": {
            "autoSC": "34.0",
            "consSC": "35.2",
            "autoLC": "34.6",
            "consLC": "35.8",
            "pts": 409
          },
          "14": {
            "autoSC": "33.3",
            "consSC": "34.0",
            "autoLC": "33.9",
            "consLC": "34.6",
            "pts": 435
          },
          "15": {
            "autoSC": "32.5",
            "consSC": "32.9",
            "autoLC": "33.1",
            "consLC": "33.5",
            "pts": 468
          },
          "16": {
            "autoSC": "31.7",
            "consSC": "31.7",
            "autoLC": "32.3",
            "consLC": "32.3",
            "pts": 505
          },
          "17": {
            "autoSC": "31.7",
            "consSC": "31.7",
            "autoLC": "32.3",
            "consLC": "32.3",
            "pts": 505
          }
        }
      },
      "100 Back": {
        "ages": {
          "12": {
            "autoSC": "1:17.4",
            "consSC": "1:20.5",
            "autoLC": "1:18.4",
            "consLC": "1:21.5",
            "pts": 356
          },
          "13": {
            "autoSC": "1:12.4",
            "consSC": "1:16.2",
            "autoLC": "1:13.5",
            "consLC": "1:17.2",
            "pts": 435
          },
          "14": {
            "autoSC": "1:11.2",
            "consSC": "1:13.2",
            "autoLC": "1:12.3",
            "consLC": "1:14.3",
            "pts": 458
          },
          "15": {
            "autoSC": "1:09.1",
            "consSC": "1:10.7",
            "autoLC": "1:10.3",
            "consLC": "1:11.8",
            "pts": 501
          },
          "16": {
            "autoSC": "1:06.1",
            "consSC": "1:06.1",
            "autoLC": "1:07.3",
            "consLC": "1:07.3",
            "pts": 572
          },
          "17": {
            "autoSC": "1:05.4",
            "consSC": "1:05.4",
            "autoLC": "1:06.6",
            "consLC": "1:06.6",
            "pts": 591
          }
        }
      },
      "200 Back": {
        "ages": {
          "12": {
            "autoSC": "2:44.7",
            "consSC": "2:50.5",
            "autoLC": "2:46.7",
            "consLC": "2:52.5",
            "pts": 376
          },
          "13": {
            "autoSC": "2:34.4",
            "consSC": "2:41.0",
            "autoLC": "2:36.6",
            "consLC": "2:43.1",
            "pts": 457
          },
          "14": {
            "autoSC": "2:31.9",
            "consSC": "2:35.6",
            "autoLC": "2:34.1",
            "consLC": "2:37.7",
            "pts": 480
          },
          "15": {
            "autoSC": "2:23.7",
            "consSC": "2:31.2",
            "autoLC": "2:26.0",
            "consLC": "2:33.4",
            "pts": 567
          },
          "16": {
            "autoSC": "2:22.0",
            "consSC": "2:22.0",
            "autoLC": "2:24.3",
            "consLC": "2:24.3",
            "pts": 587
          },
          "17": {
            "autoSC": "2:22.0",
            "consSC": "2:22.0",
            "autoLC": "2:24.3",
            "consLC": "2:24.3",
            "pts": 587
          }
        }
      },
      "50 Breast": {
        "ages": {
          "12": {
            "autoSC": "40.3",
            "consSC": "42.3",
            "autoLC": "41.1",
            "consLC": "43.0",
            "pts": 348
          },
          "13": {
            "autoSC": "37.8",
            "consSC": "39.2",
            "autoLC": "38.6",
            "consLC": "40.0",
            "pts": 422
          },
          "14": {
            "autoSC": "36.9",
            "consSC": "38.2",
            "autoLC": "37.8",
            "consLC": "39.0",
            "pts": 454
          },
          "15": {
            "autoSC": "35.8",
            "consSC": "37.4",
            "autoLC": "36.7",
            "consLC": "38.2",
            "pts": 497
          },
          "16": {
            "autoSC": "35.5",
            "consSC": "35.5",
            "autoLC": "36.4",
            "consLC": "36.4",
            "pts": 510
          },
          "17": {
            "autoSC": "35.3",
            "consSC": "35.3",
            "autoLC": "36.2",
            "consLC": "36.2",
            "pts": 519
          }
        }
      },
      "100 Breast": {
        "ages": {
          "12": {
            "autoSC": "1:28.7",
            "consSC": "1:32.8",
            "autoLC": "1:30.1",
            "consLC": "1:34.2",
            "pts": 347
          },
          "13": {
            "autoSC": "1:24.4",
            "consSC": "1:28.3",
            "autoLC": "1:25.8",
            "consLC": "1:29.7",
            "pts": 403
          },
          "14": {
            "autoSC": "1:21.0",
            "consSC": "1:24.2",
            "autoLC": "1:22.5",
            "consLC": "1:25.7",
            "pts": 456
          },
          "15": {
            "autoSC": "1:18.6",
            "consSC": "1:21.6",
            "autoLC": "1:20.2",
            "consLC": "1:23.1",
            "pts": 499
          },
          "16": {
            "autoSC": "1:17.0",
            "consSC": "1:17.0",
            "autoLC": "1:18.6",
            "consLC": "1:18.6",
            "pts": 531
          },
          "17": {
            "autoSC": "1:14.9",
            "consSC": "1:14.9",
            "autoLC": "1:16.6",
            "consLC": "1:16.6",
            "pts": 577
          }
        }
      },
      "200 Breast": {
        "ages": {
          "12": {
            "autoSC": "3:07.1",
            "consSC": "3:17.7",
            "autoLC": "3:09.9",
            "consLC": "3:20.4",
            "pts": 372
          },
          "13": {
            "autoSC": "3:00.3",
            "consSC": "3:08.7",
            "autoLC": "3:03.2",
            "consLC": "3:11.5",
            "pts": 415
          },
          "14": {
            "autoSC": "2:54.7",
            "consSC": "3:00.5",
            "autoLC": "2:57.7",
            "consLC": "3:03.4",
            "pts": 457
          },
          "15": {
            "autoSC": "2:49.3",
            "consSC": "2:55.4",
            "autoLC": "2:52.4",
            "consLC": "2:58.4",
            "pts": 502
          },
          "16": {
            "autoSC": "2:49.3",
            "consSC": "2:49.3",
            "autoLC": "2:52.4",
            "consLC": "2:52.4",
            "pts": 502
          },
          "17": {
            "autoSC": "2:39.9",
            "consSC": "2:39.9",
            "autoLC": "2:43.2",
            "consLC": "2:43.2",
            "pts": 596
          }
        }
      },
      "50 Fly": {
        "ages": {
          "12": {
            "autoSC": "33.5",
            "consSC": "35.0",
            "autoLC": "34.1",
            "consLC": "35.5",
            "pts": 385
          },
          "13": {
            "autoSC": "31.7",
            "consSC": "32.9",
            "autoLC": "32.3",
            "consLC": "33.5",
            "pts": 454
          },
          "14": {
            "autoSC": "31.3",
            "consSC": "32.0",
            "autoLC": "31.9",
            "consLC": "32.6",
            "pts": 472
          },
          "15": {
            "autoSC": "30.6",
            "consSC": "31.5",
            "autoLC": "31.2",
            "consLC": "32.1",
            "pts": 505
          },
          "16": {
            "autoSC": "29.6",
            "consSC": "29.6",
            "autoLC": "30.2",
            "consLC": "30.2",
            "pts": 558
          },
          "17": {
            "autoSC": "29.4",
            "consSC": "29.4",
            "autoLC": "30.0",
            "consLC": "30.0",
            "pts": 570
          }
        }
      },
      "100 Fly": {
        "ages": {
          "12": {
            "autoSC": "1:18.0",
            "consSC": "1:23.6",
            "autoLC": "1:19.0",
            "consLC": "1:24.5",
            "pts": 332
          },
          "13": {
            "autoSC": "1:12.7",
            "consSC": "1:17.5",
            "autoLC": "1:13.7",
            "consLC": "1:18.5",
            "pts": 410
          },
          "14": {
            "autoSC": "1:11.2",
            "consSC": "1:13.0",
            "autoLC": "1:12.3",
            "consLC": "1:14.1",
            "pts": 437
          },
          "15": {
            "autoSC": "1:07.9",
            "consSC": "1:10.4",
            "autoLC": "1:09.0",
            "consLC": "1:11.5",
            "pts": 504
          },
          "16": {
            "autoSC": "1:05.7",
            "consSC": "1:05.7",
            "autoLC": "1:06.8",
            "consLC": "1:06.8",
            "pts": 556
          },
          "17": {
            "autoSC": "1:05.7",
            "consSC": "1:05.7",
            "autoLC": "1:06.8",
            "consLC": "1:06.8",
            "pts": 556
          }
        }
      },
      "200 Fly": {
        "ages": {
          "12": {
            "autoSC": "3:02.5",
            "consSC": "3:14.9",
            "autoLC": "3:04.2",
            "consLC": "3:16.5",
            "pts": 281
          },
          "13": {
            "autoSC": "2:45.4",
            "consSC": "2:55.7",
            "autoLC": "2:47.3",
            "consLC": "2:57.5",
            "pts": 378
          },
          "14": {
            "autoSC": "2:42.3",
            "consSC": "2:49.4",
            "autoLC": "2:44.2",
            "consLC": "2:51.3",
            "pts": 400
          },
          "15": {
            "autoSC": "2:31.3",
            "consSC": "2:41.6",
            "autoLC": "2:33.4",
            "consLC": "2:43.6",
            "pts": 494
          },
          "16": {
            "autoSC": "2:26.3",
            "consSC": "2:26.3",
            "autoLC": "2:28.4",
            "consLC": "2:28.4",
            "pts": 546
          },
          "17": {
            "autoSC": "2:26.3",
            "consSC": "2:26.3",
            "autoLC": "2:28.4",
            "consLC": "2:28.4",
            "pts": 546
          }
        }
      },
      "200 IM": {
        "ages": {
          "12": {
            "autoSC": "2:46.4",
            "consSC": "2:53.2",
            "autoLC": "2:48.8",
            "consLC": "2:55.5",
            "pts": 392
          },
          "13": {
            "autoSC": "2:36.2",
            "consSC": "2:43.6",
            "autoLC": "2:38.7",
            "consLC": "2:46.0",
            "pts": 474
          },
          "14": {
            "autoSC": "2:34.0",
            "consSC": "2:37.6",
            "autoLC": "2:36.6",
            "consLC": "2:40.0",
            "pts": 495
          },
          "15": {
            "autoSC": "2:27.8",
            "consSC": "2:32.4",
            "autoLC": "2:30.4",
            "consLC": "2:35.0",
            "pts": 560
          },
          "16": {
            "autoSC": "2:25.4",
            "consSC": "2:25.4",
            "autoLC": "2:28.1",
            "consLC": "2:28.1",
            "pts": 588
          },
          "17": {
            "autoSC": "2:25.4",
            "consSC": "2:25.4",
            "autoLC": "2:28.1",
            "consLC": "2:28.1",
            "pts": 588
          }
        }
      },
      "400 IM": {
        "ages": {
          "12": {
            "autoSC": "5:54.7",
            "consSC": "6:15.3",
            "autoLC": "5:59.6",
            "consLC": "6:20.0",
            "pts": 389
          },
          "13": {
            "autoSC": "5:35.1",
            "consSC": "5:55.1",
            "autoLC": "5:40.3",
            "consLC": "6:00.0",
            "pts": 461
          },
          "14": {
            "autoSC": "5:30.1",
            "consSC": "5:38.8",
            "autoLC": "5:35.4",
            "consLC": "5:44.0",
            "pts": 482
          },
          "15": {
            "autoSC": "5:17.2",
            "consSC": "5:30.1",
            "autoLC": "5:22.7",
            "consLC": "5:35.4",
            "pts": 543
          },
          "16": {
            "autoSC": "5:15.6",
            "consSC": "5:15.6",
            "autoLC": "5:21.1",
            "consLC": "5:21.1",
            "pts": 552
          },
          "17": {
            "autoSC": "5:15.6",
            "consSC": "5:15.6",
            "autoLC": "5:21.1",
            "consLC": "5:21.1",
            "pts": 552
          }
        }
      }
    }
  }
};

export function getBenchmarks(age, gender, event, level = 'COUNTY') {
  const g = gender && String(gender).toUpperCase().startsWith('M') ? 'M' : 'F';
  const l = level.toUpperCase();
  const minAge = l === 'REGIONAL' ? 12 : 11;
  const lookupAge = Math.min(Math.max(age, minAge), 17);
  
  const eventData = STANDARDS[l]?.[g]?.[event];
  const ageData = eventData?.ages[lookupAge] || eventData?.ages[17] || eventData?.ages[12] || eventData?.ages[11];
  
  if (!ageData) return null;
  
  return {
    autoSC: timeToSeconds(ageData.autoSC),
    autoLC: timeToSeconds(ageData.autoLC),
    consSC: timeToSeconds(ageData.consSC),
    consLC: timeToSeconds(ageData.consLC)
  };
}

export function getKentBenchmark(age, gender, event, level = 'COUNTY') {
  if (!age || age < 10) return 250;
  const lookupAge = Math.min(Math.max(age, 11), 17);
  const g = gender && String(gender).toUpperCase().startsWith('M') ? 'M' : 'F';
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

export function getCategoryBenchmark(age, gender, stroke, level = 'COUNTY') {
  if (!age || age < 10) return 250;
  const lookupAge = Math.min(Math.max(age, 11), 17);
  const g = gender && String(gender).toUpperCase().startsWith('M') ? 'M' : 'F';
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
    if (eventName.toLowerCase().includes(keyword.toLowerCase())) {
      const ageData = data.ages[lookupAge] || data.ages[17] || data.ages[12] || data.ages[11];
      if (ageData) {
        totalPts += ageData.pts;
        count++;
      }
    }
  });

  if (count > 0) return Math.round(totalPts / count);

  const representative = { 'Free': '50 Free', 'Back': '50 Back', 'Breast': '50 Breast', 'Fly': '50 Fly', 'IM': '200 IM' };
  return getKentBenchmark(age, gender, representative[stroke] || '50 Free', level);
}

export function getBenchmarkTable(gender, level = 'COUNTY') {
  const g = gender && String(gender).toUpperCase().startsWith('M') ? 'M' : 'F';
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
