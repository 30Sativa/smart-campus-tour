using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence
{
    public static class DbSeeder
    {
        public static async Task SeedAsync(ApplicationDbContext context)
        {
            if (await context.Routes.AnyAsync())
            {
                return;
            }

            var amr1 = new AMRUnit
            {
                Id = Guid.NewGuid(), Name = "AMR Alpha (Rover 01)", Status = AMRStatus.Idle,
                BatteryPercent = 95, LastLat = 10.8415, LastLng = 106.8098, LastSeenAt = DateTime.UtcNow
            };
            var amr2 = new AMRUnit
            {
                Id = Guid.NewGuid(), Name = "AMR Beta (Rover 02)", Status = AMRStatus.Idle,
                BatteryPercent = 88, LastLat = 10.8416, LastLng = 106.8099, LastSeenAt = DateTime.UtcNow
            };
            var amr3 = new AMRUnit
            {
                Id = Guid.NewGuid(), Name = "AMR Gamma (Rover 03)", Status = AMRStatus.Charging,
                BatteryPercent = 35, LastLat = 10.8420, LastLng = 106.8100, LastSeenAt = DateTime.UtcNow
            };
            await context.AMRUnits.AddRangeAsync(amr1, amr2, amr3);

            var route1 = new Route
            {
                Id = Guid.NewGuid(), Name = "Tour Toàn Cảnh Smart Campus",
                Description = "Khám phá toàn diện khuôn viên trường đại học thông minh: từ các giảng đường hiện đại, thư viện số 4.0 đến trung tâm robotics và khu tiện ích sinh viên.",
                ThumbnailUrl = "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=800&q=80",
                EstimatedMinutes = 45, Status = RouteStatus.Published, CreatedAt = DateTime.UtcNow
            };
            var wp1_1 = new Waypoint { Id = Guid.NewGuid(), RouteId = route1.Id, Order = 1, Lat = 10.8415, Lng = 106.8098, Label = "Cổng Chính & Quảng Trường" };
            var poi1_1 = new POI { Id = Guid.NewGuid(), WaypointId = wp1_1.Id, Name = "Quảng trường Ánh Sáng & Cổng Chào", Description = "Điểm đón tiếp khách tham quan và khởi đầu mọi hành trình tour tự hành.", KnowledgeBase = "Cổng trường được thiết kế theo phong cách hiện đại với biểu tượng tri thức vươn cao, tích hợp camera AI nhận diện." };
            var wp1_2 = new Waypoint { Id = Guid.NewGuid(), RouteId = route1.Id, Order = 2, Lat = 10.8418, Lng = 106.8105, Label = "Thư Viện Số 4.0" };
            var poi1_2 = new POI { Id = Guid.NewGuid(), WaypointId = wp1_2.Id, Name = "Thư Viện Thông Minh Smart Library", Description = "Không gian học tập mở với hơn 100.000 đầu tài liệu số, phòng tự học 24/7 và hệ thống mượn trả tự động qua RFID.", KnowledgeBase = "Thư viện gồm 4 tầng, trang bị ghế công thái học, cabin cách âm podcast và không gian thảo luận nhóm." };
            var wp1_3 = new Waypoint { Id = Guid.NewGuid(), RouteId = route1.Id, Order = 3, Lat = 10.8423, Lng = 106.8110, Label = "Tòa Nhà Công Nghệ & Lab" };
            var poi1_3 = new POI { Id = Guid.NewGuid(), WaypointId = wp1_3.Id, Name = "MakerSpace & Robotics Lab", Description = "Nơi sinh viên nghiên cứu và chế tạo các dòng robot AMR, thử nghiệm mô phỏng Digital Twin và hệ thống tự động hóa.", KnowledgeBase = "Lab có các trang thiết bị máy in 3D công nghiệp, cánh tay robot 6 bậc tự do và dàn máy trạm GPU huấn luyện AI." };
            var wp1_4 = new Waypoint { Id = Guid.NewGuid(), RouteId = route1.Id, Order = 4, Lat = 10.8428, Lng = 106.8102, Label = "Khu Thể Thao & Tiện Ích" };
            var poi1_4 = new POI { Id = Guid.NewGuid(), WaypointId = wp1_4.Id, Name = "Student Hub & Sports Complex", Description = "Tổ hợp thể thao đa năng, bể bơi tiêu chuẩn và khu ẩm thực sinh viên sôi động.", KnowledgeBase = "Khu tiện ích phục vụ sinh viên giải trí, tái tạo năng lượng sau giờ học với canteen thông minh thanh toán một chạm." };

            var route2 = new Route
            {
                Id = Guid.NewGuid(), Name = "Tour Đổi Mới Sáng Tạo & AI Hub",
                Description = "Trải nghiệm chuyên sâu về các phòng thí nghiệm trí tuệ nhân tạo, hệ thống Digital Twin và trung tâm điều hành Smart Campus IoT.",
                ThumbnailUrl = "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80",
                EstimatedMinutes = 30, Status = RouteStatus.Published, CreatedAt = DateTime.UtcNow
            };
            var wp2_1 = new Waypoint { Id = Guid.NewGuid(), RouteId = route2.Id, Order = 1, Lat = 10.8425, Lng = 106.8108, Label = "Trung Tâm Trí Tuệ Nhân Tạo" };
            var poi2_1 = new POI { Id = Guid.NewGuid(), WaypointId = wp2_1.Id, Name = "AI Innovation Center", Description = "Nơi phát triển các thuật toán nhận diện giọng nói tiếng Việt, LLM hướng dẫn viên và điều hướng tự hành Nav2.", KnowledgeBase = "Trung tâm hợp tác với các tập đoàn công nghệ hàng đầu để triển khai các mô hình AI trên thiết bị biên Edge Computing." };
            var wp2_2 = new Waypoint { Id = Guid.NewGuid(), RouteId = route2.Id, Order = 2, Lat = 10.8430, Lng = 106.8115, Label = "Phòng Giám Sát Digital Twin" };
            var poi2_2 = new POI { Id = Guid.NewGuid(), WaypointId = wp2_2.Id, Name = "Digital Twin Operations Room", Description = "Phòng điều phối hiển thị bản đồ ảo 3D đồng bộ thời gian thực với đội xe AMR ngoài thực tế qua ROS 2.", KnowledgeBase = "Mô hình số Digital Twin cho phép kiểm thử các kịch bản tắc đường, vật cản bất ngờ trước khi robot di chuyển thật." };

            var route3 = new Route
            {
                Id = Guid.NewGuid(), Name = "Tour Nhanh Tân Sinh Viên & Phụ Huynh",
                Description = "Lộ trình nhanh giúp tân sinh viên và phụ huynh nắm bắt các địa điểm quan trọng: phòng tiếp nhận sinh viên, hội trường lớn và ký túc xá xanh.",
                ThumbnailUrl = "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80",
                EstimatedMinutes = 25, Status = RouteStatus.Published, CreatedAt = DateTime.UtcNow
            };
            var wp3_1 = new Waypoint { Id = Guid.NewGuid(), RouteId = route3.Id, Order = 1, Lat = 10.8412, Lng = 106.8095, Label = "Phòng Dịch Vụ Một Cửa" };
            var poi3_1 = new POI { Id = Guid.NewGuid(), WaypointId = wp3_1.Id, Name = "One-Stop Student Support Center", Description = "Nơi tiếp nhận và giải quyết mọi thủ tục học vụ, đăng ký tín chỉ, hỗ trợ học bổng và tư vấn tâm lý.", KnowledgeBase = "Phòng làm việc theo tiêu chuẩn ISO với kiosk điện tử lấy số thứ tự và nhân viên tư vấn nhiệt tình." };
            var wp3_2 = new Waypoint { Id = Guid.NewGuid(), RouteId = route3.Id, Order = 2, Lat = 10.8419, Lng = 106.8101, Label = "Hội Trường Lớn Alpha" };
            var poi3_2 = new POI { Id = Guid.NewGuid(), WaypointId = wp3_2.Id, Name = "Auditorium Alpha", Description = "Hội trường 1.000 chỗ ngồi với hệ thống âm thanh ánh sáng hiện đại tổ chức khai giảng và lễ tốt nghiệp.", KnowledgeBase = "Nơi thường xuyên diễn ra các buổi TEDx Talk, giao lưu doanh nghiệp và chào đón các đoàn khách quốc tế." };
            var wp3_3 = new Waypoint { Id = Guid.NewGuid(), RouteId = route3.Id, Order = 3, Lat = 10.8435, Lng = 106.8090, Label = "Ký Túc Xá Xanh Eco-Dorm" };
            var poi3_3 = new POI { Id = Guid.NewGuid(), WaypointId = wp3_3.Id, Name = "Ký Túc Xá Sinh Thái", Description = "Không gian lưu trú thân thiện môi trường với hệ thống pin mặt trời, vườn trên mái và an ninh vân tay.", KnowledgeBase = "Mỗi phòng ký túc xá được trang bị máy giặt, điều hòa inverter và ban công thoáng mát nhìn ra hồ sen." };

            await context.Routes.AddRangeAsync(route1, route2, route3);
            await context.Waypoints.AddRangeAsync(wp1_1, wp1_2, wp1_3, wp1_4, wp2_1, wp2_2, wp3_1, wp3_2, wp3_3);
            await context.POIs.AddRangeAsync(poi1_1, poi1_2, poi1_3, poi1_4, poi2_1, poi2_2, poi3_1, poi3_2, poi3_3);

            var routes = new[] { route1, route2, route3 };
            var timeOffsets = new (int startHour, int startMin, int durationMin)[] { (8, 30, 45), (10, 0, 45), (14, 0, 45), (15, 30, 45) };
            var slots = new List<TimeSlot>();
            for (var day = 0; day <= 7; day++)
            {
                foreach (var route in routes)
                {
                    foreach (var (startHour, startMin, durationMin) in timeOffsets)
                    {
                        var start = DateTime.UtcNow.Date.AddDays(day).AddHours(startHour).AddMinutes(startMin);
                        if (start > DateTime.UtcNow)
                        {
                            slots.Add(new TimeSlot { Id = Guid.NewGuid(), RouteId = route.Id, StartTime = start, EndTime = start.AddMinutes(durationMin), Capacity = 12, Status = SlotStatus.Open });
                        }
                    }
                }
            }

            await context.TimeSlots.AddRangeAsync(slots);
            await context.SaveChangesAsync();
        }
    }
}
