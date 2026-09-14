PROJECT := motor_controller
BUILD_DIR ?= build
TARGET := MotorController_G431
LINKER_SCRIPT := STM32G431C6UX_FLASH.ld

CC := arm-none-eabi-gcc
OBJCOPY := arm-none-eabi-objcopy
OBJDUMP := arm-none-eabi-objdump
SIZE := arm-none-eabi-size

SOURCE_DIRS := Core Drivers Middlewares USB_Device
C_SOURCES := $(shell find $(SOURCE_DIRS) -type f -name '*.c' | sort)
ASM_SOURCES := $(shell find Core/Startup -type f \( -name '*.s' -o -name '*.S' \) | sort)

OBJECTS := $(patsubst %.c,$(BUILD_DIR)/%.o,$(C_SOURCES)) \
           $(patsubst %.s,$(BUILD_DIR)/%.o,$(filter %.s,$(ASM_SOURCES))) \
           $(patsubst %.S,$(BUILD_DIR)/%.o,$(filter %.S,$(ASM_SOURCES)))
DEPS := $(OBJECTS:.o=.d)

INCLUDES := \
    -ICore/Inc \
    -IDrivers/STM32G4xx_HAL_Driver/Inc \
    -IDrivers/STM32G4xx_HAL_Driver/Inc/Legacy \
    -IDrivers/CMSIS/Device/ST/STM32G4xx/Include \
    -IDrivers/CMSIS/Include \
    -IUSB_Device/App \
    -IUSB_Device/Target \
    -IMiddlewares/ST/STM32_USB_Device_Library/Core/Inc \
    -IMiddlewares/ST/STM32_USB_Device_Library/Class/CDC/Inc

MCU_FLAGS := -mcpu=cortex-m4 -mfpu=fpv4-sp-d16 -mfloat-abi=hard -mthumb
CFLAGS := $(MCU_FLAGS) -std=gnu11 -g3 \
          -DDEBUG -DUSE_HAL_DRIVER -DSTM32G431xx \
          $(INCLUDES) -O0 -ffunction-sections -fdata-sections -Wall \
          --specs=nano.specs
ASFLAGS := $(MCU_FLAGS) -g3 -DDEBUG $(INCLUDES) \
           -x assembler-with-cpp --specs=nano.specs
LDFLAGS := $(MCU_FLAGS) -T$(LINKER_SCRIPT) \
           -Wl,-Map=$(BUILD_DIR)/$(TARGET).map -Wl,--gc-sections
LDLIBS := --specs=nosys.specs -static --specs=nano.specs \
         -Wl,--start-group -lc -lm -Wl,--end-group

ELF := $(BUILD_DIR)/$(TARGET).elf
BIN := $(BUILD_DIR)/$(TARGET).bin
HEX := $(BUILD_DIR)/$(TARGET).hex
LIST := $(BUILD_DIR)/$(TARGET).list

.PHONY: all clean

all: $(ELF) $(BIN) $(HEX) $(LIST)

$(ELF): $(OBJECTS) $(LINKER_SCRIPT)
	@mkdir -p $(dir $@)
	$(CC) $(OBJECTS) $(LDFLAGS) $(LDLIBS) -o $@
	$(SIZE) $@

$(BIN): $(ELF)
	$(OBJCOPY) -O binary $< $@

$(HEX): $(ELF)
	$(OBJCOPY) -O ihex $< $@

$(LIST): $(ELF)
	$(OBJDUMP) -h -S $< > $@

$(BUILD_DIR)/%.o: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -MMD -MP -MF $(@:.o=.d) -MT $@ -c $< -o $@

$(BUILD_DIR)/%.o: %.s
	@mkdir -p $(dir $@)
	$(CC) $(ASFLAGS) -MMD -MP -MF $(@:.o=.d) -MT $@ -c $< -o $@

$(BUILD_DIR)/%.o: %.S
	@mkdir -p $(dir $@)
	$(CC) $(ASFLAGS) -MMD -MP -MF $(@:.o=.d) -MT $@ -c $< -o $@

clean:
	rm -rf $(BUILD_DIR)

-include $(DEPS)
