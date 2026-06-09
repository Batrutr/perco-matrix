Нужно написать веб-сайт из одной страницы, на которой будет таблица из древа объектов (в виде древа с возможностью сворачивать его) в левой части, наверху в качестве шапки названия шаблонов. Шаблонов и помещений много - должна быть возможность листать и то и другое, при этом должно быть видно название шаблона, название помещение и ячейку пересечения. В пересечении должна быть информация о том, какой доступ предоставляет шаблон в данное помещение. Должна быть возможность фильтрации/подсветки шаблонов, помещений по значению в перечениях. Вся полученная информация должна хранится на устройстве, обновление происходит вручную при нажатии кнопки на странице (отдельное обновление для помещений и для шаблонов, и всего сразу)

Для получения информации есть api:
Для авторизации post-запрос https://{{host}}/api/system/auth с телом 
```json
{
  "login": "{{login}}",
  "password": "{{pass}}"
}
```
выдаёт
```json
{
  "token": "<string>"
}
```

Для получения древа помещений get-запрос https://{{host}}/api/rooms/tree, выдаёт
```json
[
  {
    "id": 1,
    "is_const": 1,
    "name": "",
    "parent_id": null,
    "node_type": "room",
    "segment_id": null,
    "with_rights": true,
    "room_id": 1,
    "children": [
      {
        "id": 2069228,
        "is_const": 0,
        "name": "",
        "parent_id": 1,
        "node_type": "room",
        "segment_id": null,
        "with_rights": true,
        "room_id": 2069228,
        "children": [
          {
            "id": 39055499,
            "is_const": 0,
            "name": "",
            "parent_id": 2069228,
            "node_type": "room",
            "segment_id": null,
            "with_rights": true,
            "room_id": 39055499,
            "children": [
              {
                "id": 39055500,
                "is_const": 0,
                "name": "",
                "parent_id": 39055499,
                "node_type": "room",
                "segment_id": null,
                "with_rights": true,
                "room_id": 39055500,
                "children": [
                  {
                    "id": 39055501,
                    "is_const": 0,
                    "name": "",
                    "parent_id": 39055500,
                    "node_type": "room",
                    "segment_id": null,
                    "with_rights": true,
                    "room_id": 39055501
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
]
```
 
Получение информации о шаблонах доступа get-запрос https://{{host}}/api/accessTemplates/list
```json
[
  {
    "id": 39094478,
    "name": "310",
    "comment": "",
    "is_removed": 0
  }
]
```

Для получения информации по шаблоны get-запрос https://{{host}}/api/accessTemplates/{{id}}
```json
{
  "id": 39094375,
  "name": "",
  "comment": null,
  "access": [
    {
      "access_zone_id": 2069228,
      "template_type": 0,
      "rights": {
        "is_guard": 0,
        "is_antipass": 0,
        "is_verify": 0,
        "right_type": {
          "id": 1,
          "name": "Карта"
        },
        "commission_type": {
          "id": 0,
          "name": "Нет"
        },
        "commission_group_1": 0,
        "commission_group_2": 0,
        "template_type_name": "PERCo",
        "schedule_type": {
          "id": 1,
          "name": "Временные зоны"
        },
        "schedule": {
          "id": 2,
          "name": "Всегда"
        },
        "verify_po_schedule": {
          "id": 0,
          "name": "Нет"
        },
        "verify_pdu_schedule": {
          "id": 0,
          "name": "Нет"
        },
        "verify_vvu_schedule": {
          "id": 0,
          "name": "Нет"
        },
        "verify_alcobarier_schedule": {
          "id": 0,
          "name": "Нет"
        }
      }
    }
  ]
}
```
Пока важны параметры `schedule_type`, `schedule`, `is_guard`, `is_antipass` 